// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {CounterAgentTreasuryVault} from "../src/CounterAgentTreasuryVault.sol";

contract MockERC20 {
    string public name;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory name_) {
        name = name_;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "balance");
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockTarget {
    uint256 public calls;
    bytes public lastData;

    event Called(address indexed sender, uint256 value);

    function execute(bytes calldata data) external returns (bytes32) {
        calls++;
        lastData = data;
        emit Called(msg.sender, 0);
        return keccak256(data);
    }
}

contract CounterAgentTreasuryVaultTest is Test {
    CounterAgentTreasuryVault internal vault;
    MockERC20 internal usdc;
    MockERC20 internal eurc;
    MockERC20 internal usdt;
    MockERC20 internal dai;
    MockTarget internal target;
    MockTarget internal blockedTarget;

    address internal merchant = makeAddr("merchant");
    address internal agent = makeAddr("agent");
    address internal other = makeAddr("other");

    function setUp() public {
        usdc = new MockERC20("USDC");
        eurc = new MockERC20("EURC");
        usdt = new MockERC20("USDT");
        dai = new MockERC20("DAI");
        target = new MockTarget();
        blockedTarget = new MockTarget();

        address[] memory tokens = new address[](3);
        tokens[0] = address(usdc);
        tokens[1] = address(eurc);
        tokens[2] = address(usdt);

        address[] memory targets = new address[](1);
        targets[0] = address(target);

        CounterAgentTreasuryVault implementation = new CounterAgentTreasuryVault();
        bytes memory initData = abi.encodeCall(CounterAgentTreasuryVault.initialize, (merchant, agent, tokens, targets));
        vault = CounterAgentTreasuryVault(address(new ERC1967Proxy(address(implementation), initData)));

        vm.prank(merchant);
        vault.configureAgent(
            agent,
            CounterAgentTreasuryVault.Policy({
                maxTradeAmount: 1000e6,
                dailyLimit: 2000e6,
                maxSlippageBps: 75,
                expiresAt: uint64(block.timestamp + 1 days),
                active: true
            })
        );

        usdc.mint(merchant, 10_000e6);
        vm.prank(merchant);
        usdc.approve(address(vault), type(uint256).max);
    }

    function test_depositAndOwnerWithdraw() public {
        vm.prank(merchant);
        vault.deposit(address(usdc), 1500e6);

        assertEq(usdc.balanceOf(address(vault)), 1500e6);

        vm.prank(merchant);
        vault.withdraw(address(usdc), merchant, 400e6);

        assertEq(usdc.balanceOf(address(vault)), 1100e6);
        assertEq(usdc.balanceOf(merchant), 8900e6);
    }

    function test_withdrawOnlyOwner() public {
        vm.prank(other);
        vm.expectRevert(CounterAgentTreasuryVault.NotOwner.selector);
        vault.withdraw(address(usdc), other, 1);
    }

    function test_revokeOnlyOwnerAndBlocksExecution() public {
        vm.prank(other);
        vm.expectRevert(CounterAgentTreasuryVault.NotOwner.selector);
        vault.revokePolicy();

        vm.prank(merchant);
        vault.revokePolicy();

        vm.prank(agent);
        vm.expectRevert(CounterAgentTreasuryVault.PolicyInactive.selector);
        vault.executeCall(address(target), address(usdc), address(eurc), 100e6, 99e6, 100e6, 75, _targetCall("revoked"));
    }

    function test_executeCallOnlyAuthorizedAgent() public {
        vm.prank(other);
        vm.expectRevert(CounterAgentTreasuryVault.NotAuthorizedAgent.selector);
        vault.executeCall(address(target), address(usdc), address(eurc), 100e6, 99e6, 100e6, 75, _targetCall("blocked"));
    }

    function test_executeCallSucceedsWithinPolicy() public {
        vm.prank(agent);
        bytes memory result = vault.executeCall(
            address(target), address(usdc), address(eurc), 250e6, 249e6, 250e6, 40, _targetCall("ok")
        );

        assertEq(target.calls(), 1);
        assertEq(vault.spentByDay(vault.currentDay()), 250e6);
        assertEq(abi.decode(result, (bytes32)), keccak256("ok"));
    }

    function test_executeCallRejectsPerTradeLimit() public {
        vm.prank(agent);
        vm.expectRevert(CounterAgentTreasuryVault.TradeAmountExceeded.selector);
        vault.executeCall(
            address(target), address(usdc), address(eurc), 1001e6, 990e6, 1000e6, 50, _targetCall("too-large")
        );
    }

    function test_executeCallRejectsDailyLimit() public {
        vm.prank(agent);
        vault.executeCall(
            address(target), address(usdc), address(eurc), 1000e6, 995e6, 1000e6, 50, _targetCall("first")
        );

        vm.prank(agent);
        vault.executeCall(
            address(target), address(usdc), address(eurc), 1000e6, 995e6, 1000e6, 50, _targetCall("second")
        );

        vm.prank(agent);
        vm.expectRevert(CounterAgentTreasuryVault.DailyLimitExceeded.selector);
        vault.executeCall(address(target), address(usdc), address(eurc), 1, 1, 1, 0, _targetCall("third"));
    }

    function test_executeCallResetsDailyLimitOnNextDay() public {
        vm.prank(agent);
        vault.executeCall(
            address(target), address(usdc), address(eurc), 1000e6, 995e6, 1000e6, 50, _targetCall("first")
        );

        vm.warp(block.timestamp + 1 days);

        vm.prank(agent);
        vault.executeCall(
            address(target), address(usdc), address(eurc), 1000e6, 995e6, 1000e6, 50, _targetCall("next-day")
        );

        assertEq(vault.spentByDay(vault.currentDay()), 1000e6);
    }

    function test_executeCallRejectsExpiredPolicy() public {
        vm.warp(block.timestamp + 2 days);

        vm.prank(agent);
        vm.expectRevert(CounterAgentTreasuryVault.PolicyExpired.selector);
        vault.executeCall(address(target), address(usdc), address(eurc), 100e6, 99e6, 100e6, 75, _targetCall("expired"));
    }

    function test_executeCallRejectsDisallowedToken() public {
        vm.prank(agent);
        vm.expectRevert(CounterAgentTreasuryVault.TokenNotAllowed.selector);
        vault.executeCall(
            address(target), address(dai), address(eurc), 100e6, 99e6, 100e6, 75, _targetCall("bad-token")
        );
    }

    function test_executeCallRejectsDisallowedTarget() public {
        vm.prank(agent);
        vm.expectRevert(CounterAgentTreasuryVault.TargetNotAllowed.selector);
        vault.executeCall(
            address(blockedTarget), address(usdc), address(eurc), 100e6, 99e6, 100e6, 75, _targetCall("bad-target")
        );
    }

    function test_executeCallRejectsSlippageAbovePolicy() public {
        vm.prank(agent);
        vm.expectRevert(CounterAgentTreasuryVault.SlippageExceeded.selector);
        vault.executeCall(address(target), address(usdc), address(eurc), 100e6, 99e6, 100e6, 76, _targetCall("bad-bps"));
    }

    function test_executeCallRejectsMinOutBelowSlippage() public {
        vm.prank(agent);
        vm.expectRevert(CounterAgentTreasuryVault.SlippageExceeded.selector);
        vault.executeCall(address(target), address(usdc), address(eurc), 100e6, 98e6, 100e6, 75, _targetCall("bad-min"));
    }

    function test_ownerCanUpdateTokenAndTargetAllowlists() public {
        vm.startPrank(merchant);
        vault.setTokenAllowed(address(dai), true);
        vault.setTargetAllowed(address(blockedTarget), true);
        vm.stopPrank();

        vm.prank(agent);
        vault.executeCall(
            address(blockedTarget),
            address(dai),
            address(eurc),
            100e6,
            99_250_000,
            100e6,
            75,
            _targetCall("allowed-now")
        );

        assertEq(blockedTarget.calls(), 1);
    }

    function test_initializeRejectsSecondCall() public {
        address[] memory tokens = new address[](1);
        tokens[0] = address(usdc);
        address[] memory targets = new address[](1);
        targets[0] = address(target);

        vm.expectRevert(bytes4(keccak256("InvalidInitialization()")));
        vault.initialize(merchant, agent, tokens, targets);
    }

    function _targetCall(bytes memory data) internal pure returns (bytes memory) {
        return abi.encodeCall(MockTarget.execute, (data));
    }
}
