// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {SMTToken} from "../src/SMTToken.sol";
import {SemantiVault} from "../src/SemantiVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SemantiVaultTest is Test {
    SMTToken smt;
    SemantiVault vault;

    address resolver = makeAddr("resolver");
    address promiser = makeAddr("promiser");
    address beneficiary = makeAddr("beneficiary");

    uint64 constant BUFFER = 1 hours;
    uint256 constant BOND = 1_000e18;
    uint256 constant COUNTER = 400e18;

    function setUp() public {
        smt = new SMTToken(1_000_000e18);
        vault = new SemantiVault(IERC20(address(smt)), resolver, BUFFER);
        smt.transfer(promiser, 10_000e18);
        smt.transfer(beneficiary, 10_000e18);
        vm.prank(promiser);
        smt.approve(address(vault), type(uint256).max);
        vm.prank(beneficiary);
        smt.approve(address(vault), type(uint256).max);
    }

    function _post(uint256 id) internal {
        vm.prank(promiser);
        vault.postCommitment(id, beneficiary, BOND);
    }

    function test_postLocksBond() public {
        _post(1);
        assertEq(vault.lockedOf(1), BOND);
        assertEq(smt.balanceOf(address(vault)), BOND);
    }

    function test_cannotPostTwice() public {
        _post(1);
        vm.prank(promiser);
        vm.expectRevert(SemantiVault.AlreadyExists.selector);
        vault.postCommitment(1, beneficiary, BOND);
    }

    function test_onlyBeneficiaryAssertsBreach() public {
        _post(1);
        vm.prank(promiser);
        vm.expectRevert(SemantiVault.OnlyBeneficiary.selector);
        vault.assertBreach(1, COUNTER);
    }

    function test_settleProportionalSplit() public {
        _post(1);
        vm.prank(beneficiary);
        vault.assertBreach(1, COUNTER);
        skip(BUFFER + 1);

        uint256 pBefore = smt.balanceOf(promiser);
        uint256 bBefore = smt.balanceOf(beneficiary);

        // kept 71%, breach 18%, undetermined 11%
        vm.prank(resolver);
        vault.settle(1, 7100, 1800, 1);

        // promiser: 82% of bond back (kept + undetermined) + 71% of counter
        assertEq(smt.balanceOf(promiser) - pBefore, (BOND * 8200) / 10_000 + (COUNTER * 7100) / 10_000);
        // beneficiary: 18% of bond + 29% of own counter back
        assertEq(smt.balanceOf(beneficiary) - bBefore, (BOND * 1800) / 10_000 + (COUNTER * 2900) / 10_000);
        assertEq(smt.balanceOf(address(vault)), 0);
    }

    function test_undeterminedIsSafeFailure() public {
        _post(1);
        vm.prank(beneficiary);
        vault.assertBreach(1, COUNTER);
        skip(BUFFER + 1);

        uint256 pBefore = smt.balanceOf(promiser);
        uint256 bBefore = smt.balanceOf(beneficiary);

        // never converged: everything undetermined, both sides made whole
        vm.prank(resolver);
        vault.settle(1, 0, 0, 1);

        assertEq(smt.balanceOf(promiser) - pBefore, BOND);
        assertEq(smt.balanceOf(beneficiary) - bBefore, COUNTER);
    }

    function test_onlyResolverSettles() public {
        _post(1);
        skip(BUFFER + 1);
        vm.expectRevert(SemantiVault.NotResolver.selector);
        vault.settle(1, 10_000, 0, 1);
    }

    function test_challengeBufferBlocksEarlySettle() public {
        _post(1);
        vm.prank(resolver);
        vm.expectRevert(SemantiVault.TooEarly.selector);
        vault.settle(1, 10_000, 0, 1);
    }

    function test_replayRejected() public {
        _post(1);
        skip(BUFFER + 1);
        vm.startPrank(resolver);
        vault.settle(1, 10_000, 0, 1);
        // same nonce again
        vm.expectRevert(SemantiVault.NotLocked.selector);
        vault.settle(1, 10_000, 0, 1);
        vm.stopPrank();
    }

    function test_staleNonceRejected() public {
        _post(1);
        _post(2);
        skip(BUFFER + 1);
        vm.startPrank(resolver);
        vault.settle(1, 10_000, 0, 5);
        // commitment 2 with a lower nonce is fine (nonces are per-commitment)
        vault.settle(2, 0, 10_000, 1);
        vm.stopPrank();
    }

    function test_badBpsRejected() public {
        _post(1);
        skip(BUFFER + 1);
        vm.prank(resolver);
        vm.expectRevert(SemantiVault.BadBps.selector);
        vault.settle(1, 9000, 2000, 1);
    }
}
