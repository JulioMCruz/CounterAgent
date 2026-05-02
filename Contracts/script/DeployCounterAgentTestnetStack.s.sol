// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MerchantRegistry} from "../src/MerchantRegistry.sol";
import {CounterAgentTreasuryVault} from "../src/CounterAgentTreasuryVault.sol";
import {CounterAgentTreasuryVaultFactory} from "../src/CounterAgentTreasuryVaultFactory.sol";

contract DeployCounterAgentTestnetStack is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address owner = vm.addr(pk);

        vm.startBroadcast(pk);

        MerchantRegistry registryImpl = new MerchantRegistry();
        ERC1967Proxy registryProxy =
            new ERC1967Proxy(address(registryImpl), abi.encodeCall(MerchantRegistry.initialize, (owner)));

        CounterAgentTreasuryVault vaultImpl = new CounterAgentTreasuryVault();
        CounterAgentTreasuryVaultFactory factoryImpl = new CounterAgentTreasuryVaultFactory();
        ERC1967Proxy factoryProxy = new ERC1967Proxy(
            address(factoryImpl),
            abi.encodeCall(CounterAgentTreasuryVaultFactory.initialize, (owner, address(vaultImpl)))
        );

        vm.stopBroadcast();

        CounterAgentTreasuryVaultFactory factory = CounterAgentTreasuryVaultFactory(address(factoryProxy));

        console.log("Chain id:", block.chainid);
        console.log("Owner:", owner);
        console.log("MerchantRegistry proxy:", address(registryProxy));
        console.log("MerchantRegistry implementation:", address(registryImpl));
        console.log("TreasuryVault implementation:", address(vaultImpl));
        console.log("TreasuryVaultFactory proxy:", address(factoryProxy));
        console.log("TreasuryVaultFactory implementation:", address(factoryImpl));
        console.log("TreasuryVault beacon:", factory.beacon());
    }
}
