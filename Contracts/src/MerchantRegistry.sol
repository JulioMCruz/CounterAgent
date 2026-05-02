// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title MerchantRegistry
/// @notice Upgradeable on-chain merchant treasury config for CounterAgent. Acts as a fallback / mirror
///         to the canonical ENS text-record store described in the project docs.
/// @dev Each merchant address self-registers a single Config struct; only the merchant can update/deactivate it.
contract MerchantRegistry is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    bytes32 public constant REGISTER_TYPEHASH = keccak256(
        "Register(address merchant,uint16 fxThresholdBps,uint8 risk,address preferredStablecoin,bytes32 telegramChatId,uint256 nonce,uint256 deadline)"
    );
    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256(bytes("CounterAgent MerchantRegistry"));
    bytes32 private constant VERSION_HASH = keccak256(bytes("1"));

    enum RiskTolerance {
        Conservative,
        Moderate,
        Aggressive
    }

    struct Config {
        uint16 fxThresholdBps; // basis points, e.g. 50 = 0.50%
        RiskTolerance risk;
        address preferredStablecoin; // e.g. USDC on Base
        bytes32 telegramChatId; // hashed/encoded chat handle
        bool active;
    }

    mapping(address => Config) private _configs;
    mapping(address => uint256) public nonces;

    event MerchantRegistered(
        address indexed merchant, uint16 fxThresholdBps, RiskTolerance risk, address preferredStablecoin
    );
    event ConfigUpdated(
        address indexed merchant, uint16 fxThresholdBps, RiskTolerance risk, address preferredStablecoin
    );
    event MerchantDeactivated(address indexed merchant);

    error AlreadyRegistered();
    error NotRegistered();
    error InvalidThreshold();
    error ZeroAddress();
    error ExpiredSignature();
    error InvalidSignature();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) external initializer {
        if (initialOwner == address(0)) revert ZeroAddress();
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();
    }

    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return keccak256(abi.encode(EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    function register(uint16 fxThresholdBps, RiskTolerance risk, address preferredStablecoin, bytes32 telegramChatId)
        external
    {
        _registerFor(msg.sender, fxThresholdBps, risk, preferredStablecoin, telegramChatId);
    }

    /// @notice Register a merchant through an agent/relayer using the merchant's EIP-712 signature.
    /// @dev This lets A0 coordinate onboarding and pay gas without taking custody of the merchant wallet.
    function registerFor(
        address merchant,
        uint16 fxThresholdBps,
        RiskTolerance risk,
        address preferredStablecoin,
        bytes32 telegramChatId,
        uint256 deadline,
        bytes calldata signature
    ) external {
        if (block.timestamp > deadline) revert ExpiredSignature();

        uint256 nonce = nonces[merchant]++;
        bytes32 structHash = keccak256(
            abi.encode(
                REGISTER_TYPEHASH,
                merchant,
                fxThresholdBps,
                uint8(risk),
                preferredStablecoin,
                telegramChatId,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR(), structHash));
        address signer = _recover(digest, signature);
        if (signer != merchant) revert InvalidSignature();

        _registerFor(merchant, fxThresholdBps, risk, preferredStablecoin, telegramChatId);
    }

    function _registerFor(
        address merchant,
        uint16 fxThresholdBps,
        RiskTolerance risk,
        address preferredStablecoin,
        bytes32 telegramChatId
    ) internal {
        if (merchant == address(0)) revert ZeroAddress();
        if (_configs[merchant].active) revert AlreadyRegistered();
        if (fxThresholdBps == 0 || fxThresholdBps > 10_000) revert InvalidThreshold();
        if (preferredStablecoin == address(0)) revert ZeroAddress();

        _configs[merchant] = Config({
            fxThresholdBps: fxThresholdBps,
            risk: risk,
            preferredStablecoin: preferredStablecoin,
            telegramChatId: telegramChatId,
            active: true
        });

        emit MerchantRegistered(merchant, fxThresholdBps, risk, preferredStablecoin);
    }

    function _recover(bytes32 digest, bytes calldata signature) internal pure returns (address signer) {
        if (signature.length != 65) revert InvalidSignature();

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 0x20))
            v := byte(0, calldataload(add(signature.offset, 0x40)))
        }

        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert InvalidSignature();

        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }

    function update(uint16 fxThresholdBps, RiskTolerance risk, address preferredStablecoin, bytes32 telegramChatId)
        external
    {
        Config storage c = _configs[msg.sender];
        if (!c.active) revert NotRegistered();
        if (fxThresholdBps == 0 || fxThresholdBps > 10_000) revert InvalidThreshold();
        if (preferredStablecoin == address(0)) revert ZeroAddress();

        c.fxThresholdBps = fxThresholdBps;
        c.risk = risk;
        c.preferredStablecoin = preferredStablecoin;
        c.telegramChatId = telegramChatId;

        emit ConfigUpdated(msg.sender, fxThresholdBps, risk, preferredStablecoin);
    }

    function deactivate() external {
        if (!_configs[msg.sender].active) revert NotRegistered();
        _configs[msg.sender].active = false;
        emit MerchantDeactivated(msg.sender);
    }

    function configOf(address merchant) external view returns (Config memory) {
        return _configs[merchant];
    }

    function isActive(address merchant) external view returns (bool) {
        return _configs[merchant].active;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
