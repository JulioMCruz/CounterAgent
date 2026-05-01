// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {CounterAgentTreasuryVault} from "./CounterAgentTreasuryVault.sol";

/// @title CounterAgentTreasuryVaultFactory
/// @notice Upgradeable factory that creates one merchant-owned BeaconProxy vault per merchant wallet.
/// @dev Deploy behind an OpenZeppelin ERC1967Proxy per chain. The factory owns the beacon so the owner can upgrade all vault implementations.
contract CounterAgentTreasuryVaultFactory is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    address public beacon;
    mapping(address => address) public vaultOf;

    event VaultCreated(address indexed merchant, address indexed vault, address indexed authorizedAgent, bytes32 salt);
    event VaultImplementationUpgraded(address indexed implementation);

    error VaultAlreadyExists(address vault);
    error ZeroAddress();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner, address vaultImplementation) external initializer {
        if (initialOwner == address(0) || vaultImplementation == address(0)) revert ZeroAddress();
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();

        beacon = address(new UpgradeableBeacon(vaultImplementation, address(this)));
    }

    function predictedVault(address merchant) external view returns (address) {
        if (merchant == address(0)) revert ZeroAddress();
        return Create2.computeAddress(_salt(merchant), keccak256(_proxyCreationCode()), address(this));
    }

    function createVault(address authorizedAgent, address[] calldata initialTokens, address[] calldata initialTargets)
        external
        returns (address vault)
    {
        if (authorizedAgent == address(0)) revert ZeroAddress();
        if (vaultOf[msg.sender] != address(0)) revert VaultAlreadyExists(vaultOf[msg.sender]);

        bytes32 salt = _salt(msg.sender);
        vault = address(new BeaconProxy{salt: salt}(beacon, ""));
        CounterAgentTreasuryVault(vault).initialize(msg.sender, authorizedAgent, initialTokens, initialTargets);
        vaultOf[msg.sender] = vault;

        emit VaultCreated(msg.sender, vault, authorizedAgent, salt);
    }

    function upgradeVaultImplementation(address newImplementation) external onlyOwner {
        if (newImplementation == address(0)) revert ZeroAddress();
        UpgradeableBeacon(beacon).upgradeTo(newImplementation);
        emit VaultImplementationUpgraded(newImplementation);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function _proxyCreationCode() internal view returns (bytes memory) {
        return abi.encodePacked(type(BeaconProxy).creationCode, abi.encode(beacon, ""));
    }

    function _salt(address merchant) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("counteragent.vault.v1", merchant));
    }
}
