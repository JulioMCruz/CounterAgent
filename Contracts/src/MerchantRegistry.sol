// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MerchantRegistry
/// @notice On-chain merchant treasury config for CounterAgent. Acts as a fallback / mirror
///         to the canonical ENS text-record store described in the project docs.
/// @dev Each merchant address self-registers a single Config struct; only the merchant
///      can update or deactivate their own entry. No admin, no upgrade path.
contract MerchantRegistry {
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

    function register(
        uint16 fxThresholdBps,
        RiskTolerance risk,
        address preferredStablecoin,
        bytes32 telegramChatId
    ) external {
        if (_configs[msg.sender].active) revert AlreadyRegistered();
        if (fxThresholdBps == 0 || fxThresholdBps > 10_000) revert InvalidThreshold();
        if (preferredStablecoin == address(0)) revert ZeroAddress();

        _configs[msg.sender] = Config({
            fxThresholdBps: fxThresholdBps,
            risk: risk,
            preferredStablecoin: preferredStablecoin,
            telegramChatId: telegramChatId,
            active: true
        });

        emit MerchantRegistered(msg.sender, fxThresholdBps, risk, preferredStablecoin);
    }

    function update(
        uint16 fxThresholdBps,
        RiskTolerance risk,
        address preferredStablecoin,
        bytes32 telegramChatId
    ) external {
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
}
