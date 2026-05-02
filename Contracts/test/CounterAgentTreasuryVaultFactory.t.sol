// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {CounterAgentTreasuryVault} from "../src/CounterAgentTreasuryVault.sol";
import {CounterAgentTreasuryVaultFactory} from "../src/CounterAgentTreasuryVaultFactory.sol";

contract CounterAgentTreasuryVaultV2 is CounterAgentTreasuryVault {
    function version() external pure returns (uint256) {
        return 2;
    }
}

contract CounterAgentTreasuryVaultFactoryTest is Test {
    CounterAgentTreasuryVaultFactory internal factory;
    CounterAgentTreasuryVault internal implementation;

    address internal admin = makeAddr("admin");
    address internal merchant = makeAddr("merchant");
    address internal agent = makeAddr("a3-agent");
    address internal token = makeAddr("usdc");
    address internal target = makeAddr("uniswap-adapter");

    function setUp() public {
        implementation = new CounterAgentTreasuryVault();
        CounterAgentTreasuryVaultFactory factoryImplementation = new CounterAgentTreasuryVaultFactory();
        bytes memory initData =
            abi.encodeCall(CounterAgentTreasuryVaultFactory.initialize, (admin, address(implementation)));
        factory = CounterAgentTreasuryVaultFactory(address(new ERC1967Proxy(address(factoryImplementation), initData)));
    }

    function test_createVaultCreatesMerchantOwnedBeaconProxyVault() public {
        (address[] memory tokens, address[] memory targets) = _allowlists();

        address predicted = factory.predictedVault(merchant);
        vm.prank(merchant);
        address vaultAddress = factory.createVault(agent, tokens, targets);

        CounterAgentTreasuryVault vault = CounterAgentTreasuryVault(vaultAddress);
        assertEq(vaultAddress, predicted);
        assertEq(factory.vaultOf(merchant), vaultAddress);
        assertEq(vault.owner(), merchant);
        assertEq(vault.authorizedAgent(), agent);
        assertTrue(vault.allowedToken(token));
        assertTrue(vault.allowedTarget(target));
    }

    function test_ownerCanUpgradeVaultImplementationForExistingVaults() public {
        (address[] memory tokens, address[] memory targets) = _allowlists();

        vm.prank(merchant);
        address vaultAddress = factory.createVault(agent, tokens, targets);

        CounterAgentTreasuryVaultV2 v2 = new CounterAgentTreasuryVaultV2();
        vm.prank(admin);
        factory.upgradeVaultImplementation(address(v2));

        assertEq(CounterAgentTreasuryVaultV2(vaultAddress).version(), 2);
        assertEq(CounterAgentTreasuryVault(vaultAddress).owner(), merchant);
    }

    function test_nonOwnerCannotUpgradeVaultImplementation() public {
        CounterAgentTreasuryVaultV2 v2 = new CounterAgentTreasuryVaultV2();

        vm.prank(merchant);
        vm.expectRevert();
        factory.upgradeVaultImplementation(address(v2));
    }

    function test_createVaultRejectsDuplicateMerchantVault() public {
        (address[] memory tokens, address[] memory targets) = _allowlists();

        vm.startPrank(merchant);
        address firstVault = factory.createVault(agent, tokens, targets);
        vm.expectRevert(
            abi.encodeWithSelector(CounterAgentTreasuryVaultFactory.VaultAlreadyExists.selector, firstVault)
        );
        factory.createVault(agent, tokens, targets);
        vm.stopPrank();
    }

    function test_createVaultRejectsZeroAgent() public {
        (address[] memory tokens, address[] memory targets) = _allowlists();

        vm.prank(merchant);
        vm.expectRevert(CounterAgentTreasuryVaultFactory.ZeroAddress.selector);
        factory.createVault(address(0), tokens, targets);
    }

    function _allowlists() internal view returns (address[] memory tokens, address[] memory targets) {
        tokens = new address[](1);
        tokens[0] = token;
        targets = new address[](1);
        targets[0] = target;
    }
}
