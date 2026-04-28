// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";

interface IENSRegistryOwner {
    function owner(bytes32 node) external view returns (address);
    function setOwner(bytes32 node, address owner) external;
}

contract AuthorizeCounterAgentENSRegistrar is Script {
    address internal constant SEPOLIA_ENS_REGISTRY = 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e;
    bytes32 internal constant COUNTERAGENT_ETH_NODE =
        0x81b4205485f00fa5bd59de49b1c175696067841b080c650d6af3dce4ef8bf4ff;

    function run() external {
        uint256 controllerPrivateKey = vm.envUint("ENS_CONTROLLER_PRIVATE_KEY");
        address registrar = vm.envAddress("ENS_REGISTRAR_ADDRESS");
        IENSRegistryOwner registry = IENSRegistryOwner(SEPOLIA_ENS_REGISTRY);

        vm.startBroadcast(controllerPrivateKey);
        registry.setOwner(COUNTERAGENT_ETH_NODE, registrar);
        vm.stopBroadcast();

        console.log("counteragent.eth owner:", registry.owner(COUNTERAGENT_ETH_NODE));
        console.log("Authorized registrar:", registrar);
    }
}
