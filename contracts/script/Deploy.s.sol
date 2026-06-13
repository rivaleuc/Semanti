// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {SMTToken} from "../src/SMTToken.sol";
import {SemantiVault} from "../src/SemantiVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// Deploys SMT + SemantiVault.
/// Env:
///   RESOLVER          address of the GenLayer ghost contract relay
///   CHALLENGE_BUFFER  seconds (default 6 hours)
contract Deploy is Script {
    function run() external {
        address resolver = vm.envAddress("RESOLVER");
        uint64 buffer = uint64(vm.envOr("CHALLENGE_BUFFER", uint256(6 hours)));

        vm.startBroadcast();
        SMTToken smt = new SMTToken(100_000_000e18);
        SemantiVault vault = new SemantiVault(IERC20(address(smt)), resolver, buffer);
        vm.stopBroadcast();

        console.log("SMT:  ", address(smt));
        console.log("Vault:", address(vault));
    }
}
