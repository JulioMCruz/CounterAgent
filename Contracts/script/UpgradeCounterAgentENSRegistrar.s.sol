// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {CounterAgentENSRegistrar} from "../src/CounterAgentENSRegistrar.sol";

contract UpgradeCounterAgentENSRegistrar is Script {
    function run() external returns (address implementation) {
        uint256 ownerPrivateKey = vm.envUint("ERC8004_OPERATOR_PRIVATE_KEY");
        address registrarProxy = vm.envAddress("ENS_REGISTRAR_ADDRESS");
        address provisioner = vm.envAddress("ENS_PROVISIONER_ADDRESS");

        vm.startBroadcast(ownerPrivateKey);

        CounterAgentENSRegistrar impl = new CounterAgentENSRegistrar();
        implementation = address(impl);

        CounterAgentENSRegistrar registrar = CounterAgentENSRegistrar(registrarProxy);
        registrar.upgradeToAndCall(implementation, "");
        registrar.setProvisioner(provisioner, true);

        vm.stopBroadcast();

        console.log("CounterAgentENSRegistrar proxy:", registrarProxy);
        console.log("CounterAgentENSRegistrar implementation:", implementation);
        console.log("Provisioner:", provisioner);
        console.log("Provisioner allowed:", registrar.provisioners(provisioner));
        console.log("Chain id:", block.chainid);
    }
}
