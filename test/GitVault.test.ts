import { expect } from "chai";
import { ethers } from "hardhat";
import { GitVaultFactory, GitVault } from "../artifacts-hardhat/types";

describe("GitVaultFactory + GitVault", function () {
  let factory: GitVaultFactory;
  let deployer: any;
  let user: any;
  let recovery: any;
  let feeCollector: any;

  beforeEach(async function () {
    [deployer, user, recovery, feeCollector] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("GitVaultFactory");
    factory = (await Factory.deploy(feeCollector.address)) as GitVaultFactory;
    await factory.waitForDeployment();
  });

  it("deploys factory with correct feeCollector", async function () {
    expect(await factory.feeCollector()).to.equal(feeCollector.address);
  });

  it("creates a vault for a GitHub user ID", async function () {
    const githubId = 12345678n;
    const tx = await factory.connect(user).createGitVault(githubId);
    await tx.wait();

    expect(await factory.hasVault(githubId)).to.be.true;
    const vaultAddr = await factory.getVaultByGithubId(githubId);
    expect(vaultAddr).to.not.equal(ethers.ZeroAddress);

    const vault = await ethers.getContractAt("GitVault", vaultAddr) as GitVault;
    expect(await vault.githubUserId()).to.equal(githubId);
    expect(await vault.owner()).to.equal(user.address);
    expect(await vault.feeCollector()).to.equal(feeCollector.address);
    expect(await vault.initialized()).to.be.true;
  });

  it("rejects duplicate vault for same GitHub ID", async function () {
    const githubId = 99999n;
    await factory.connect(user).createGitVault(githubId);
    await expect(
      factory.connect(deployer).createGitVault(githubId)
    ).to.be.revertedWith("GitVaultFactory: vault already exists for this GitHub ID");
  });

  it("rejects duplicate vault for same owner address", async function () {
    await factory.connect(user).createGitVault(111n);
    await expect(
      factory.connect(user).createGitVault(222n)
    ).to.be.revertedWith("GitVaultFactory: vault already exists for this address");
  });

  describe("GitVault operations", function () {
    let vault: GitVault;
    let mockToken: any;

    beforeEach(async function () {
      const githubId = 42n;
      await factory.connect(user).createGitVault(githubId);
      const vaultAddr = await factory.getVaultByGithubId(githubId);
      vault = (await ethers.getContractAt("GitVault", vaultAddr)) as GitVault;

      // Deploy a mock ERC-20 for testing
      const MockToken = await ethers.getContractFactory("MockERC20");
      mockToken = await MockToken.deploy("Test USDC", "USDC", 6);
      await mockToken.waitForDeployment();

      // Mint tokens to user
      await mockToken.mint(user.address, ethers.parseUnits("1000", 6));
      await mockToken.connect(user).approve(await vault.getAddress(), ethers.parseUnits("1000", 6));
    });

    it("gitLock mints gitTokens and collects fee", async function () {
      const amount = ethers.parseUnits("100", 6);
      await vault.connect(user).gitLock(await mockToken.getAddress(), amount, 0);

      const gitTokenAddr = await vault.getGitTokenAddress(await mockToken.getAddress());
      const GitToken = await ethers.getContractAt("GitToken", gitTokenAddr);
      const balance = await GitToken.balanceOf(user.address);

      // Net = 100 - 0.10% fee = 99.9 USDC (in 6 decimals)
      expect(balance).to.be.lessThan(amount);
      expect(balance).to.be.greaterThan(ethers.parseUnits("99", 6));
    });

    it("setRecoveryAddress works correctly", async function () {
      await vault.connect(user).setRecoveryAddress(recovery.address);
      expect(await vault.recoveryAddress()).to.equal(recovery.address);
    });

    it("rotateOwner can only be called by recovery address", async function () {
      await vault.connect(user).setRecoveryAddress(recovery.address);
      const [, , , , newOwner] = await ethers.getSigners();

      await vault.connect(recovery).rotateOwner(newOwner.address);
      expect(await vault.owner()).to.equal(newOwner.address);
    });

    it("rotateOwner reverts if called by non-recovery", async function () {
      await vault.connect(user).setRecoveryAddress(recovery.address);
      const [, , , , newOwner] = await ethers.getSigners();

      await expect(
        vault.connect(user).rotateOwner(newOwner.address)
      ).to.be.revertedWith("GitVault: not recovery address");
    });

    it("nonce replay protection works", async function () {
      const amount = ethers.parseUnits("50", 6);
      await vault.connect(user).gitLock(await mockToken.getAddress(), amount, 0);

      // Replay with same nonce should fail
      await expect(
        vault.connect(user).gitLock(await mockToken.getAddress(), amount, 0)
      ).to.be.revertedWith("GitVault: invalid nonce");
    });

    it("GitToken transfers are permanently disabled", async function () {
      const amount = ethers.parseUnits("10", 6);
      await vault.connect(user).gitLock(await mockToken.getAddress(), amount, 0);

      const gitTokenAddr = await vault.getGitTokenAddress(await mockToken.getAddress());
      const GitToken = await ethers.getContractAt("GitToken", gitTokenAddr);

      await expect(
        GitToken.connect(user).transfer(deployer.address, 1)
      ).to.be.revertedWith("gitToken: transfers disabled");

      await expect(
        GitToken.connect(user).approve(deployer.address, 1)
      ).to.be.revertedWith("gitToken: approvals disabled");
    });
  });
});
