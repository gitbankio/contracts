// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.34;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title GitToken
 * @notice Soul-bound ERC-20 issued 1:1 against assets locked in a GitVault.
 *         Transfers and approvals are permanently disabled — tokens can only
 *         be minted or burned by the GitVault that created them.
 */
contract GitToken is ERC20 {
    address public vault;
    uint8   private _decimals;

    modifier onlyVault() {
        require(msg.sender == vault, "GitToken: only vault");
        _;
    }

    constructor(
        string memory name,
        string memory symbol,
        address _vault,
        uint8   decimals_
    ) ERC20(name, symbol) {
        vault     = _vault;
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external onlyVault {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyVault {
        _burn(from, amount);
    }

    // ── Soul-bound: all P2P movement permanently disabled ────────────────────

    function transfer(address, uint256) public pure override returns (bool) {
        revert("gitToken: transfers disabled");
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        revert("gitToken: transfers disabled");
    }

    function approve(address, uint256) public pure override returns (bool) {
        revert("gitToken: approvals disabled");
    }
}
