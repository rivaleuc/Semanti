// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title SMT, the conviction bond token for SEMANTI.
/// @notice Fixed supply minted to the deployer. No inflation, no yield
/// mechanics. The token exists only to bond commercial promises.
contract SMTToken is ERC20, Ownable {
    constructor(uint256 initialSupply) ERC20("Semanti", "SMT") Ownable(msg.sender) {
        _mint(msg.sender, initialSupply);
    }
}
