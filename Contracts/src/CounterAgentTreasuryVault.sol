// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title CounterAgentTreasuryVault
/// @notice Merchant-owned upgradeable vault implementation that lets A3 execute only policy-guarded calls.
/// @dev Intended to run behind OpenZeppelin proxies/beacons. The merchant remains owner and only withdrawer.
contract CounterAgentTreasuryVault is Initializable {
    struct Policy {
        uint256 maxTradeAmount;
        uint256 dailyLimit;
        uint16 maxSlippageBps;
        uint64 expiresAt;
        bool active;
    }

    address public owner;
    address public authorizedAgent;
    Policy public policy;

    mapping(address => bool) public allowedToken;
    mapping(address => bool) public allowedTarget;
    mapping(uint256 => uint256) public spentByDay;

    bool private _executing;

    event VaultInitialized(address indexed owner, address indexed authorizedAgent);
    event VaultConfigured(
        address indexed owner,
        address indexed authorizedAgent,
        uint256 maxTradeAmount,
        uint256 dailyLimit,
        uint16 maxSlippageBps,
        uint64 expiresAt,
        bool active
    );
    event FundsDeposited(address indexed token, address indexed from, uint256 amount);
    event FundsWithdrawn(address indexed token, address indexed to, uint256 amount);
    event AgentExecutionAuthorized(address indexed agent, address indexed target);
    event AgentExecutionExecuted(
        address indexed agent,
        address indexed target,
        address indexed inputToken,
        address outputToken,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 expectedAmountOut,
        uint16 slippageBps,
        bytes result
    );
    event PolicyRevoked(address indexed owner);

    error NotOwner();
    error NotAuthorizedAgent();
    error ZeroAddress();
    error InvalidPolicy();
    error PolicyInactive();
    error PolicyExpired();
    error TokenNotAllowed();
    error TargetNotAllowed();
    error TradeAmountExceeded();
    error DailyLimitExceeded();
    error SlippageExceeded();
    error ExecutionFailed(bytes reason);
    error ReentrantExecution();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAuthorizedAgent() {
        if (msg.sender != authorizedAgent) revert NotAuthorizedAgent();
        _;
    }

    function initialize(
        address initialOwner,
        address initialAgent,
        address[] memory initialTokens,
        address[] memory initialTargets
    ) external initializer {
        if (initialOwner == address(0) || initialAgent == address(0)) {
            revert ZeroAddress();
        }

        owner = initialOwner;
        authorizedAgent = initialAgent;

        for (uint256 i = 0; i < initialTokens.length; i++) {
            if (initialTokens[i] == address(0)) revert ZeroAddress();
            allowedToken[initialTokens[i]] = true;
        }
        for (uint256 i = 0; i < initialTargets.length; i++) {
            if (initialTargets[i] == address(0)) revert ZeroAddress();
            allowedTarget[initialTargets[i]] = true;
        }

        emit VaultInitialized(initialOwner, initialAgent);
        emit AgentExecutionAuthorized(initialAgent, address(0));
    }

    function configureAgent(address newAgent, Policy calldata newPolicy) external onlyOwner {
        if (newAgent == address(0)) revert ZeroAddress();
        _validatePolicy(newPolicy);

        authorizedAgent = newAgent;
        policy = newPolicy;

        emit AgentExecutionAuthorized(newAgent, address(0));
        emit VaultConfigured(
            owner,
            newAgent,
            newPolicy.maxTradeAmount,
            newPolicy.dailyLimit,
            newPolicy.maxSlippageBps,
            newPolicy.expiresAt,
            newPolicy.active
        );
    }

    function setTokenAllowed(address token, bool allowed) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        allowedToken[token] = allowed;
    }

    function setTargetAllowed(address target, bool allowed) external onlyOwner {
        if (target == address(0)) revert ZeroAddress();
        allowedTarget[target] = allowed;
    }

    function revokePolicy() external onlyOwner {
        policy.active = false;
        emit PolicyRevoked(msg.sender);
    }

    function deposit(address token, uint256 amount) external onlyOwner {
        if (!allowedToken[token]) revert TokenNotAllowed();
        if (amount == 0) revert InvalidPolicy();
        _safeTransferFrom(token, msg.sender, address(this), amount);
        emit FundsDeposited(token, msg.sender, amount);
    }

    function withdraw(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        _safeTransfer(token, to, amount);
        emit FundsWithdrawn(token, to, amount);
    }

    /// @notice Execute a whitelisted target call inside the merchant-signed policy bounds.
    /// @dev This intentionally does not know Uniswap internals. The target and tokens are policy inputs,
    ///      while calldata stays opaque for auditability and future router/keeper adapters.
    function executeCall(
        address target,
        address inputToken,
        address outputToken,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 expectedAmountOut,
        uint16 slippageBps,
        bytes calldata data
    ) external onlyAuthorizedAgent returns (bytes memory result) {
        if (_executing) revert ReentrantExecution();
        _enforcePolicy(target, inputToken, outputToken, amountIn, minAmountOut, expectedAmountOut, slippageBps);

        _executing = true;
        (bool ok, bytes memory response) = target.call(data);
        _executing = false;

        if (!ok) revert ExecutionFailed(response);

        emit AgentExecutionExecuted(
            msg.sender,
            target,
            inputToken,
            outputToken,
            amountIn,
            minAmountOut,
            expectedAmountOut,
            slippageBps,
            response
        );

        return response;
    }

    function currentDay() public view returns (uint256) {
        return block.timestamp / 1 days;
    }

    function _enforcePolicy(
        address target,
        address inputToken,
        address outputToken,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 expectedAmountOut,
        uint16 slippageBps
    ) internal {
        Policy memory p = policy;
        if (!p.active) revert PolicyInactive();
        if (block.timestamp > p.expiresAt) revert PolicyExpired();
        if (!allowedTarget[target]) revert TargetNotAllowed();
        if (!allowedToken[inputToken] || !allowedToken[outputToken]) revert TokenNotAllowed();
        if (amountIn == 0 || amountIn > p.maxTradeAmount) revert TradeAmountExceeded();
        if (slippageBps > p.maxSlippageBps) revert SlippageExceeded();
        if (expectedAmountOut > 0) {
            uint256 minimumAllowed = expectedAmountOut * (10_000 - slippageBps) / 10_000;
            if (minAmountOut < minimumAllowed) revert SlippageExceeded();
        }

        uint256 day = currentDay();
        uint256 nextSpent = spentByDay[day] + amountIn;
        if (nextSpent > p.dailyLimit) revert DailyLimitExceeded();
        spentByDay[day] = nextSpent;
    }

    function _validatePolicy(Policy calldata newPolicy) internal view {
        if (!newPolicy.active) revert InvalidPolicy();
        if (newPolicy.maxTradeAmount == 0 || newPolicy.dailyLimit == 0) revert InvalidPolicy();
        if (newPolicy.maxTradeAmount > newPolicy.dailyLimit) revert InvalidPolicy();
        if (newPolicy.maxSlippageBps > 10_000) revert InvalidPolicy();
        if (newPolicy.expiresAt <= block.timestamp) revert InvalidPolicy();
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(abi.encodeCall(IERC20Minimal.transfer, (to, amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert ExecutionFailed(data);
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(abi.encodeCall(IERC20Minimal.transferFrom, (from, to, amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert ExecutionFailed(data);
    }
}
