// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {CounterAgentENSRegistrar} from "../src/CounterAgentENSRegistrar.sol";

contract MockENSRegistry {
    mapping(bytes32 => address) public owner;
    mapping(bytes32 => address) public resolver;

    function setOwner(bytes32 node, address newOwner) external {
        require(owner[node] == address(0) || owner[node] == msg.sender, "not owner");
        owner[node] = newOwner;
    }

    function setResolver(bytes32 node, address newResolver) external {
        require(owner[node] == msg.sender, "not owner");
        resolver[node] = newResolver;
    }

    function setSubnodeOwner(bytes32 node, bytes32 label, address newOwner) external returns (bytes32 subnode) {
        require(owner[node] == msg.sender, "not parent owner");
        subnode = keccak256(abi.encodePacked(node, label));
        owner[subnode] = newOwner;
    }
}

contract MockPublicResolver {
    MockENSRegistry public registry;
    mapping(bytes32 => address) public addr;
    mapping(bytes32 => mapping(string => string)) public text;

    constructor(MockENSRegistry registry_) {
        registry = registry_;
    }

    function setAddr(bytes32 node, address value) external {
        require(registry.owner(node) == msg.sender, "not owner");
        addr[node] = value;
    }

    function setText(bytes32 node, string calldata key, string calldata value) external {
        require(registry.owner(node) == msg.sender, "not owner");
        text[node][key] = value;
    }
}

contract CounterAgentENSRegistrarTest is Test {
    bytes32 internal constant PARENT_NODE = keccak256("counteragents.eth");

    MockENSRegistry internal registry;
    MockPublicResolver internal resolver;
    CounterAgentENSRegistrar internal registrar;
    address internal owner = address(0xA11CE);
    address internal provisioner = address(0xA100);
    address internal merchant = address(0xB0B);

    function setUp() public {
        registry = new MockENSRegistry();
        resolver = new MockPublicResolver(registry);

        CounterAgentENSRegistrar impl = new CounterAgentENSRegistrar();
        bytes memory initData = abi.encodeCall(
            CounterAgentENSRegistrar.initialize,
            (owner, address(registry), address(resolver), PARENT_NODE, "counteragents.eth")
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        registrar = CounterAgentENSRegistrar(address(proxy));

        registry.setOwner(PARENT_NODE, address(registrar));
    }

    function testProvisionMerchantSubname() public {
        vm.prank(owner);
        bytes32 node = registrar.provisionMerchant(
            "julio-store",
            merchant,
            50,
            "moderate",
            "USDC",
            "@merchant",
            "0xd532D7C9Ddc28d16601FaA5Cc6F54cDABb703C28"
        );

        assertEq(registry.owner(node), merchant);
        assertEq(registry.resolver(node), address(resolver));
        assertEq(resolver.addr(node), merchant);
        assertEq(resolver.text(node, "counteragent.fx_threshold_bps"), "50");
        assertEq(resolver.text(node, "counteragent.risk_tolerance"), "moderate");
        assertEq(resolver.text(node, "counteragent.preferred_stablecoin"), "USDC");
        assertEq(resolver.text(node, "counteragent.telegram_chat_id"), "@merchant");
    }

    function testProvisionerCanProvision() public {
        vm.prank(owner);
        registrar.setProvisioner(provisioner, true);

        vm.prank(provisioner);
        bytes32 node = registrar.provisionMerchant(
            "agent-store", merchant, 75, "balanced", "USDC", "@agent", "0xd532D7C9Ddc28d16601FaA5Cc6F54cDABb703C28"
        );

        assertEq(registry.owner(node), merchant);
        assertEq(resolver.addr(node), merchant);
        assertEq(resolver.text(node, "counteragent.fx_threshold_bps"), "75");
    }

    function testOwnerCanRevokeProvisioner() public {
        vm.prank(owner);
        registrar.setProvisioner(provisioner, true);

        vm.prank(owner);
        registrar.setProvisioner(provisioner, false);

        vm.prank(provisioner);
        vm.expectRevert("not provisioner");
        registrar.provisionMerchant("revoked", merchant, 50, "moderate", "USDC", "@merchant", "registry");
    }

    function testOnlyProvisionerOrOwnerCanProvision() public {
        vm.expectRevert("not provisioner");
        registrar.provisionMerchant("bad", merchant, 50, "moderate", "USDC", "@merchant", "registry");
    }
}
