// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MerchantRegistry} from "../src/MerchantRegistry.sol";

contract MerchantRegistryTest is Test {
    MerchantRegistry internal registry;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal usdc = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913; // USDC on Base
    address internal eurc = 0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42; // EURC on Base

    bytes32 internal chatA = keccak256("alice-chat");
    bytes32 internal chatB = keccak256("bob-chat");

    function setUp() public {
        registry = new MerchantRegistry();
    }

    function test_register_storesConfig() public {
        vm.prank(alice);
        registry.register(50, MerchantRegistry.RiskTolerance.Moderate, usdc, chatA);

        MerchantRegistry.Config memory c = registry.configOf(alice);
        assertEq(c.fxThresholdBps, 50);
        assertEq(uint8(c.risk), uint8(MerchantRegistry.RiskTolerance.Moderate));
        assertEq(c.preferredStablecoin, usdc);
        assertEq(c.telegramChatId, chatA);
        assertTrue(c.active);
        assertTrue(registry.isActive(alice));
    }

    function test_register_emitsEvent() public {
        vm.expectEmit(true, false, false, true, address(registry));
        emit MerchantRegistry.MerchantRegistered(alice, 50, MerchantRegistry.RiskTolerance.Moderate, usdc);
        vm.prank(alice);
        registry.register(50, MerchantRegistry.RiskTolerance.Moderate, usdc, chatA);
    }

    function test_register_revertsIfAlreadyRegistered() public {
        vm.startPrank(alice);
        registry.register(50, MerchantRegistry.RiskTolerance.Moderate, usdc, chatA);
        vm.expectRevert(MerchantRegistry.AlreadyRegistered.selector);
        registry.register(75, MerchantRegistry.RiskTolerance.Aggressive, eurc, chatA);
        vm.stopPrank();
    }

    function test_register_revertsOnZeroThreshold() public {
        vm.prank(alice);
        vm.expectRevert(MerchantRegistry.InvalidThreshold.selector);
        registry.register(0, MerchantRegistry.RiskTolerance.Moderate, usdc, chatA);
    }

    function test_register_revertsOnThresholdAboveMax() public {
        vm.prank(alice);
        vm.expectRevert(MerchantRegistry.InvalidThreshold.selector);
        registry.register(10_001, MerchantRegistry.RiskTolerance.Moderate, usdc, chatA);
    }

    function test_register_revertsOnZeroStablecoin() public {
        vm.prank(alice);
        vm.expectRevert(MerchantRegistry.ZeroAddress.selector);
        registry.register(50, MerchantRegistry.RiskTolerance.Moderate, address(0), chatA);
    }

    function test_update_changesConfig() public {
        vm.startPrank(alice);
        registry.register(50, MerchantRegistry.RiskTolerance.Moderate, usdc, chatA);
        registry.update(125, MerchantRegistry.RiskTolerance.Aggressive, eurc, chatB);
        vm.stopPrank();

        MerchantRegistry.Config memory c = registry.configOf(alice);
        assertEq(c.fxThresholdBps, 125);
        assertEq(uint8(c.risk), uint8(MerchantRegistry.RiskTolerance.Aggressive));
        assertEq(c.preferredStablecoin, eurc);
        assertEq(c.telegramChatId, chatB);
        assertTrue(c.active);
    }

    function test_update_revertsIfNotRegistered() public {
        vm.prank(alice);
        vm.expectRevert(MerchantRegistry.NotRegistered.selector);
        registry.update(50, MerchantRegistry.RiskTolerance.Moderate, usdc, chatA);
    }

    function test_deactivate_marksInactive() public {
        vm.startPrank(alice);
        registry.register(50, MerchantRegistry.RiskTolerance.Moderate, usdc, chatA);
        registry.deactivate();
        vm.stopPrank();

        assertFalse(registry.isActive(alice));
        assertFalse(registry.configOf(alice).active);
    }

    function test_deactivate_revertsIfNotRegistered() public {
        vm.prank(alice);
        vm.expectRevert(MerchantRegistry.NotRegistered.selector);
        registry.deactivate();
    }

    function test_merchantsAreIsolated() public {
        vm.prank(alice);
        registry.register(50, MerchantRegistry.RiskTolerance.Conservative, usdc, chatA);
        vm.prank(bob);
        registry.register(200, MerchantRegistry.RiskTolerance.Aggressive, eurc, chatB);

        assertEq(registry.configOf(alice).fxThresholdBps, 50);
        assertEq(registry.configOf(bob).fxThresholdBps, 200);
        assertEq(registry.configOf(alice).preferredStablecoin, usdc);
        assertEq(registry.configOf(bob).preferredStablecoin, eurc);
    }

    function testFuzz_register_acceptsValidThreshold(uint16 bps) public {
        bps = uint16(bound(uint256(bps), 1, 10_000));
        vm.prank(alice);
        registry.register(bps, MerchantRegistry.RiskTolerance.Moderate, usdc, chatA);
        assertEq(registry.configOf(alice).fxThresholdBps, bps);
    }
}
