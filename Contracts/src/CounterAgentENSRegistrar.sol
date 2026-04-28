// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

interface IENSRegistry {
    function owner(bytes32 node) external view returns (address);
    function resolver(bytes32 node) external view returns (address);
    function setOwner(bytes32 node, address owner) external;
    function setResolver(bytes32 node, address resolver) external;
    function setSubnodeOwner(bytes32 node, bytes32 label, address owner) external returns (bytes32);
}

interface IPublicResolver {
    function setAddr(bytes32 node, address addr) external;
    function setText(bytes32 node, string calldata key, string calldata value) external;
}

contract CounterAgentENSRegistrar is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    IENSRegistry public ensRegistry;
    IPublicResolver public publicResolver;
    bytes32 public parentNode;
    string public parentName;

    event MerchantSubnameProvisioned(
        bytes32 indexed node,
        bytes32 indexed labelhash,
        string label,
        string name,
        address indexed merchant,
        uint256 fxThresholdBps,
        string riskTolerance,
        string preferredStablecoin,
        string registryAddress
    );

    event ResolverUpdated(address indexed resolver);
    event ParentOwnerTransferred(address indexed newOwner);
    event ProvisionerUpdated(address indexed provisioner, bool allowed);

    mapping(address => bool) public provisioners;

    struct MerchantConfig {
        uint256 fxThresholdBps;
        string riskTolerance;
        string preferredStablecoin;
        string telegramChatId;
        string registryAddress;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address initialOwner,
        address registry,
        address resolver,
        bytes32 parent,
        string calldata parentEnsName
    ) external initializer {
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();

        require(registry != address(0), "registry required");
        require(resolver != address(0), "resolver required");
        require(parent != bytes32(0), "parent required");
        require(bytes(parentEnsName).length != 0, "parent name required");

        ensRegistry = IENSRegistry(registry);
        publicResolver = IPublicResolver(resolver);
        parentNode = parent;
        parentName = parentEnsName;
    }

    modifier onlyProvisionerOrOwner() {
        require(owner() == _msgSender() || provisioners[_msgSender()], "not provisioner");
        _;
    }

    function provisionMerchant(
        string calldata label,
        address merchant,
        uint256 fxThresholdBps,
        string calldata riskTolerance,
        string calldata preferredStablecoin,
        string calldata telegramChatId,
        string calldata registryAddress
    ) external onlyProvisionerOrOwner returns (bytes32 node) {
        MerchantConfig memory config = MerchantConfig({
            fxThresholdBps: fxThresholdBps,
            riskTolerance: riskTolerance,
            preferredStablecoin: preferredStablecoin,
            telegramChatId: telegramChatId,
            registryAddress: registryAddress
        });
        return _provisionMerchant(label, merchant, config);
    }

    function _provisionMerchant(
        string calldata label,
        address merchant,
        MerchantConfig memory config
    ) internal returns (bytes32 node) {
        require(bytes(label).length != 0, "label required");
        require(merchant != address(0), "merchant required");
        require(config.fxThresholdBps <= 10_000, "invalid threshold");

        bytes32 labelhash = keccak256(bytes(label));
        node = keccak256(abi.encodePacked(parentNode, labelhash));
        string memory name = string.concat(label, ".", parentName);

        ensRegistry.setSubnodeOwner(parentNode, labelhash, address(this));
        ensRegistry.setResolver(node, address(publicResolver));
        _writeRecords(node, merchant, config);
        ensRegistry.setOwner(node, merchant);

        emit MerchantSubnameProvisioned(
            node,
            labelhash,
            label,
            name,
            merchant,
            config.fxThresholdBps,
            config.riskTolerance,
            config.preferredStablecoin,
            config.registryAddress
        );
    }

    function _writeRecords(bytes32 node, address merchant, MerchantConfig memory config) internal {
        publicResolver.setAddr(node, merchant);
        publicResolver.setText(node, "counteragent.wallet", _addressToString(merchant));
        publicResolver.setText(node, "counteragent.fx_threshold_bps", _uintToString(config.fxThresholdBps));
        publicResolver.setText(node, "counteragent.risk_tolerance", config.riskTolerance);
        publicResolver.setText(node, "counteragent.preferred_stablecoin", config.preferredStablecoin);
        publicResolver.setText(node, "counteragent.telegram_chat_id", config.telegramChatId);
        publicResolver.setText(node, "counteragent.registry", config.registryAddress);
        publicResolver.setText(node, "counteragent.version", "1");
    }

    function setProvisioner(address provisioner, bool allowed) external onlyOwner {
        require(provisioner != address(0), "provisioner required");
        provisioners[provisioner] = allowed;
        emit ProvisionerUpdated(provisioner, allowed);
    }

    function setPublicResolver(address resolver) external onlyOwner {
        require(resolver != address(0), "resolver required");
        publicResolver = IPublicResolver(resolver);
        emit ResolverUpdated(resolver);
    }

    function transferParentOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "owner required");
        ensRegistry.setOwner(parentNode, newOwner);
        emit ParentOwnerTransferred(newOwner);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function _addressToString(address account) internal pure returns (string memory) {
        bytes20 value = bytes20(account);
        bytes16 symbols = "0123456789abcdef";
        bytes memory buffer = new bytes(42);
        buffer[0] = "0";
        buffer[1] = "x";
        for (uint256 i = 0; i < 20; i++) {
            buffer[2 + i * 2] = symbols[uint8(value[i] >> 4)];
            buffer[3 + i * 2] = symbols[uint8(value[i] & 0x0f)];
        }
        return string(buffer);
    }

    function _uintToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
