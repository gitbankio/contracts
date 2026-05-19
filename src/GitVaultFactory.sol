// SPDX-License-Identifier: Apache-2.0
// https://gitbank.io
pragma solidity 0.8.34;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./GitVault.sol";

/**
 * @title GitVaultFactory
 * @notice Deploys minimal-proxy (EIP-1167) clones of GitVault.
 *
 *         Each GitHub Permanent User ID may own exactly one GitVault.
 *         The factory enforces this 1-to-1 mapping and is the sole entry
 *         point for vault creation, called by the Gitbank Relayer after
 *         it verifies the caller's GitHub ID via IssueOps authentication.
 *
 *         Meta-transaction model: the deployer wallet calls createGitVault
 *         and passes the ownerAddress explicitly. The owner never pays gas
 *         and never appears as msg.sender anywhere in vault operations.
 *
 *         The feeCollector and relayerSigner addresses are set once at
 *         constructor time and forwarded to every vault clone at
 *         initialization, ensuring consistent security configuration
 *         across all vaults.
 */
contract GitVaultFactory {
    using Clones for address;

    address public immutable gitVaultImpl;
    address public immutable feeCollector;
    address public immutable relayerSigner;

    /// @notice Tokens allowed as swap output in every vault (e.g. WETH, USDC).
    address[] public swapOutputTokens;

    /// @notice githubUserId => vault address
    mapping(uint256 => address) private vaultByGithubId;

    /// @notice owner address => vault address
    mapping(address => address) private vaultByOwner;

    event GitVaultCreated(
        address indexed owner,
        uint256 indexed githubUserId,
        address indexed vault
    );

    constructor(
        address _feeCollector,
        address _relayerSigner,
        address[] memory _swapOutputTokens
    ) {
        require(_feeCollector   != address(0), "GitVaultFactory: zero feeCollector");
        require(_relayerSigner  != address(0), "GitVaultFactory: zero relayerSigner");
        require(_swapOutputTokens.length > 0,  "GitVaultFactory: empty swap whitelist");
        feeCollector     = _feeCollector;
        relayerSigner    = _relayerSigner;
        swapOutputTokens = _swapOutputTokens;
        gitVaultImpl     = address(new GitVault());
    }

    /**
     * @notice Deploy a new GitVault for the given owner and GitHub user ID.
     *         Called by the Gitbank deployer wallet (not by the owner themselves).
     *         The deployer pays gas; the owner address is passed explicitly.
     *
     * @param githubUserId  GitHub Permanent User ID to bind to this vault.
     * @param ownerAddress  Execution keypair address for this vault (signs intent).
     * @return vault        Address of the newly created GitVault clone.
     */
    function createGitVault(uint256 githubUserId, address ownerAddress) external returns (address vault) {
        require(githubUserId != 0,                              "GitVaultFactory: zero githubUserId");
        require(ownerAddress != address(0),                    "GitVaultFactory: zero ownerAddress");
        require(vaultByGithubId[githubUserId] == address(0),   "GitVaultFactory: vault already exists for this GitHub ID");
        require(vaultByOwner[ownerAddress]    == address(0),   "GitVaultFactory: vault already exists for this address");

        vault = gitVaultImpl.clone();
        GitVault(vault).initialize(ownerAddress, githubUserId, feeCollector, relayerSigner, swapOutputTokens);

        vaultByGithubId[githubUserId] = vault;
        vaultByOwner[ownerAddress]    = vault;

        emit GitVaultCreated(ownerAddress, githubUserId, vault);
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    function hasVault(uint256 githubUserId) external view returns (bool) {
        return vaultByGithubId[githubUserId] != address(0);
    }

    function hasVaultForAddress(address _owner) external view returns (bool) {
        return vaultByOwner[_owner] != address(0);
    }

    function getVaultByGithubId(uint256 githubUserId) external view returns (address) {
        return vaultByGithubId[githubUserId];
    }

    function getVaultByOwner(address _owner) external view returns (address) {
        return vaultByOwner[_owner];
    }
}
