// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MerchantRegistry} from "../src/MerchantRegistry.sol";

contract DeployMerchantRegistry is Script {
    function run() external returns (MerchantRegistry registry) {
        uint256 pk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(pk);
        registry = new MerchantRegistry();
        vm.stopBroadcast();

        console.log("MerchantRegistry deployed at:", address(registry));
        console.log("Chain id:", block.chainid);
    }
}
