// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title SemantiVault, the EVM settlement side of SEMANTI.
/// @notice Holds SMT bonds for natural-language commitments while their
/// semantic resolution converges on GenLayer. The vault never interprets
/// anything: it only releases or slashes proportionally to the final
/// belief mass relayed by the resolver (the GenLayer ghost contract).
///
/// Lifecycle:
///   1. postCommitment: promiser locks a bond, names a beneficiary.
///   2. assertBreach (optional): beneficiary adds a counter-stake.
///   3. settle: resolver delivers (beliefKeptBps, finalityNonce) after
///      GenLayer finalization. Funds split proportionally to belief mass.
///   4. reopen on GenLayer mints a new finalityNonce; an old settlement
///      cannot be replayed because each (id, nonce) is consumed once.
contract SemantiVault is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;

    enum Status {
        None,
        Locked,
        Settled
    }

    struct Commitment {
        address promiser;
        address beneficiary;
        uint256 bond; // promiser stake (released proportional to kept mass)
        uint256 counterStake; // beneficiary stake (released proportional to breach mass)
        uint64 settleAfter; // challenge buffer: earliest settlement timestamp
        Status status;
        uint16 keptBps; // recorded at settlement
        uint256 lastNonce;
    }

    IERC20 public immutable smt;
    address public resolver;
    uint64 public challengeBuffer;

    mapping(uint256 => Commitment) public commitments;
    mapping(uint256 => mapping(uint256 => bool)) public consumedNonce;

    event CommitmentPosted(
        uint256 indexed id, address indexed promiser, address indexed beneficiary, uint256 bond
    );
    event BreachAsserted(uint256 indexed id, address indexed beneficiary, uint256 counterStake);
    event Settled(uint256 indexed id, uint16 keptBps, uint256 nonce);
    event ResolverUpdated(address resolver);

    error NotResolver();
    error AlreadyExists();
    error NotLocked();
    error NonceConsumed();
    error TooEarly();
    error BadBps();
    error OnlyBeneficiary();

    constructor(IERC20 _smt, address _resolver, uint64 _challengeBuffer) Ownable(msg.sender) {
        smt = _smt;
        resolver = _resolver;
        challengeBuffer = _challengeBuffer;
    }

    function setResolver(address _resolver) external onlyOwner {
        resolver = _resolver;
        emit ResolverUpdated(_resolver);
    }

    /// @notice Lock a conviction bond behind a commitment. The id must match
    /// the commitment key registered on the GenLayer side.
    function postCommitment(uint256 id, address beneficiary, uint256 bond) external nonReentrant {
        if (commitments[id].status != Status.None) revert AlreadyExists();
        commitments[id] = Commitment({
            promiser: msg.sender,
            beneficiary: beneficiary,
            bond: bond,
            counterStake: 0,
            settleAfter: uint64(block.timestamp) + challengeBuffer,
            status: Status.Locked,
            keptBps: 0,
            lastNonce: 0
        });
        smt.safeTransferFrom(msg.sender, address(this), bond);
        emit CommitmentPosted(id, msg.sender, beneficiary, bond);
    }

    /// @notice Beneficiary stakes SMT to assert the promise was breached.
    /// Slashed proportionally if the promise is judged kept.
    function assertBreach(uint256 id, uint256 stake) external nonReentrant {
        Commitment storage c = commitments[id];
        if (c.status != Status.Locked) revert NotLocked();
        if (msg.sender != c.beneficiary) revert OnlyBeneficiary();
        c.counterStake += stake;
        smt.safeTransferFrom(msg.sender, address(this), stake);
        emit BreachAsserted(id, msg.sender, stake);
    }

    /// @notice Called by the resolver after GenLayer finalization survives
    /// its appeal window. Splits both stakes proportionally to belief mass:
    /// undetermined mass (the remainder) returns to its original owner, so a
    /// promise that never converges is a safe failure, not a slash.
    function settle(uint256 id, uint16 beliefKeptBps, uint16 beliefBreachBps, uint256 nonce)
        external
        nonReentrant
    {
        if (msg.sender != resolver) revert NotResolver();
        if (uint256(beliefKeptBps) + uint256(beliefBreachBps) > BPS) revert BadBps();
        Commitment storage c = commitments[id];
        if (c.status != Status.Locked) revert NotLocked();
        if (block.timestamp < c.settleAfter) revert TooEarly();
        if (consumedNonce[id][nonce] || nonce <= c.lastNonce) revert NonceConsumed();

        consumedNonce[id][nonce] = true;
        c.lastNonce = nonce;
        c.status = Status.Settled;
        c.keptBps = beliefKeptBps;

        // Promiser bond: kept mass returns to promiser, breach mass goes to
        // the beneficiary, undetermined mass returns to the promiser.
        uint256 bondToBeneficiary = (c.bond * beliefBreachBps) / BPS;
        uint256 bondToPromiser = c.bond - bondToBeneficiary;

        // Counter-stake mirrors it: kept mass is slashed to the promiser,
        // the rest returns to the beneficiary.
        uint256 counterToPromiser = (c.counterStake * beliefKeptBps) / BPS;
        uint256 counterToBeneficiary = c.counterStake - counterToPromiser;

        if (bondToPromiser + counterToPromiser > 0) {
            smt.safeTransfer(c.promiser, bondToPromiser + counterToPromiser);
        }
        if (bondToBeneficiary + counterToBeneficiary > 0) {
            smt.safeTransfer(c.beneficiary, bondToBeneficiary + counterToBeneficiary);
        }
        emit Settled(id, beliefKeptBps, nonce);
    }

    function lockedOf(uint256 id) external view returns (uint256) {
        Commitment storage c = commitments[id];
        if (c.status != Status.Locked) return 0;
        return c.bond + c.counterStake;
    }
}
