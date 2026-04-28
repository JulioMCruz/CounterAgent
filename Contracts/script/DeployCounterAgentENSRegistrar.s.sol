// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {CounterAgentENSRegistrar} from "../src/CounterAgentENSRegistrar.sol";

contract DeployCounterAgentENSRegistrar is Script {
    address internal constant SEPOLIA_ENS_REGISTRY = 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e;
    address internal constant SEPOLIA_PUBLIC_RESOLVER = 0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5;
    bytes32 internal constant COUNTERAGENT_ETH_NODE =
        0x81b4205485f00fa5bd59de49b1c175696067841b080c650d6af3dce4ef8bf4ff;

    function run() external returns (CounterAgentENSRegistrar registrar, address implementation) {
        uint256 deployerPrivateKey = vm.envUint("ERC8004_OPERATOR_PRIVATE_KEY");
        address owner = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        CounterAgentENSRegistrar impl = new CounterAgentENSRegistrar();
        bytes memory initData = abi.encodeCall(
            CounterAgentENSRegistrar.initialize,
            (owner, SEPOLIA_ENS_REGISTRY, SEPOLIA_PUBLIC_RESOLVER, COUNTERAGENT_ETH_NODE, "counteragent.eth")
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);

        vm.stopBroadcast();

        registrar = CounterAgentENSRegistrar(address(proxy));
        implementation = address(impl);

        console.log("CounterAgentENSRegistrar proxy:", address(registrar));
        console.log("CounterAgentENSRegistrar implementation:", implementation);
        console.log("Owner:", owner);
        console.log("Chain id:", block.chainid);
    }
}
