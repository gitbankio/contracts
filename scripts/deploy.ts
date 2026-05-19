import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Swap output whitelist — only these tokens can be received from gitSwap.
// WETH address is identical on Base mainnet and Base Sepolia (system contract).
const WETH = "0x4200000000000000000000000000000000000006";

// USDC differs by network.
const USDC_BY_CHAIN: Record<string, string> = {
  "84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia
  "8453":  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base mainnet
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId.toString();

  console.log("Network:", network.name, "chainId:", chainId);
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  if (balance === 0n) {
    throw new Error("Deployer has no ETH. Fund the account before deploying.");
  }

  const feeCollector = process.env["FEE_COLLECTOR_ADDRESS"] ?? deployer.address;
  console.log("Fee collector:", feeCollector);

  const relayerSigner = process.env["RELAYER_SIGNING_ADDRESS"];
  if (!relayerSigner) throw new Error("RELAYER_SIGNING_ADDRESS env var is required");
  console.log("Relayer signer:", relayerSigner);

  const usdc = USDC_BY_CHAIN[chainId];
  if (!usdc) throw new Error(`No USDC address configured for chainId ${chainId}`);
  const swapOutputTokens = [WETH, usdc];
  console.log("Swap output whitelist:", swapOutputTokens);

  console.log("\nDeploying GitVaultFactory...");
  const GitVaultFactory = await ethers.getContractFactory("GitVaultFactory");
  const factory = await GitVaultFactory.deploy(feeCollector, relayerSigner, swapOutputTokens);

  const deployTx = factory.deploymentTransaction();
  console.log("Deploy tx:", deployTx?.hash);

  await factory.waitForDeployment();
  if (deployTx) {
    console.log("Waiting for 2 confirmations...");
    await deployTx.wait(2);
  }

  const factoryAddress = await factory.getAddress();
  console.log("GitVaultFactory deployed:", factoryAddress);

  let implAddress: string = "";
  for (let i = 0; i < 5; i++) {
    try {
      implAddress = await factory.gitVaultImpl();
      break;
    } catch {
      console.log(`Retry ${i + 1}/5 reading gitVaultImpl...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  if (!implAddress) throw new Error("Could not read gitVaultImpl after retries");
  console.log("GitVault implementation:", implAddress);

  const deployments = {
    network: network.name,
    chainId,
    GitVaultFactory: factoryAddress,
    GitVaultImpl: implAddress,
    feeCollector,
    deployer: deployer.address,
    swapOutputWhitelist: swapOutputTokens,
    deployedAt: new Date().toISOString(),
  };

  const outPath = path.join(__dirname, "../deployments.json");
  fs.writeFileSync(outPath, JSON.stringify(deployments, null, 2));
  console.log("\nDeployment saved to contracts/deployments.json");
  console.log(JSON.stringify(deployments, null, 2));

  // Write verify-args for this deployment
  const verifyArgsPath = path.join(__dirname, "../scripts/verify-args-factory.ts");
  const verifyArgsContent = `module.exports = [\n  "${feeCollector}",\n  "${relayerSigner}",\n  [\n    "${WETH}",\n    "${usdc}",\n  ],\n];\n`;
  fs.writeFileSync(verifyArgsPath, verifyArgsContent);
  console.log("Verify args written to scripts/verify-args-factory.ts");

  // Auto-verify on Basescan via Etherscan API V2 with explicit licenseType=12 (Apache-2.0)
  console.log("\nAuto-verifying on Basescan (licenseType=12 Apache-2.0)...");
  const BASESCAN_API_KEY = process.env["BASESCAN_API_KEY"] ?? "";
  const explorer = chainId === "8453" ? "https://basescan.org" : "https://sepolia.basescan.org";

  if (!BASESCAN_API_KEY) {
    console.warn("BASESCAN_API_KEY not set — skipping verification");
  } else {
    // Build Standard JSON Input from Hardhat build-info (use require/fs — CJS compatible)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const https = require("https") as typeof import("https");
    const buildInfoDir = path.join(__dirname, "../artifacts-hardhat/build-info");
    const buildInfoFiles = fs.readdirSync(buildInfoDir)
      .map((f: string) => ({ f, mtime: fs.statSync(path.join(buildInfoDir, f)).mtimeMs }))
      .sort((a: {mtime: number}, b: {mtime: number}) => b.mtime - a.mtime);
    const buildInfo = JSON.parse(
      fs.readFileSync(path.join(buildInfoDir, buildInfoFiles[0].f), "utf8")
    );
    const inp = buildInfo.input;
    const verifyInput = JSON.stringify({
      language: inp.language,
      sources: inp.sources,
      settings: {
        optimizer: inp.settings.optimizer,
        evmVersion: inp.settings.evmVersion,
        viaIR: inp.settings.viaIR,
        outputSelection: { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode"] } },
      },
    });
    const compilerVersion = "v" + buildInfo.solcLongVersion;

    // ABI-encode constructor args for factory
    const factoryArgsEncoded = ethers.AbiCoder.defaultAbiCoder()
      .encode(["address", "address", "address[]"], [feeCollector, relayerSigner, swapOutputTokens])
      .slice(2);

    function submitVerifyV2(
      contractAddress: string,
      contractName: string,
      constructorArgs: string,
    ): Promise<string> {
      const params = new URLSearchParams({
        apikey: BASESCAN_API_KEY,
        module: "contract",
        action: "verifysourcecode",
        sourceCode: verifyInput,
        codeformat: "solidity-standard-json-input",
        contractaddress: contractAddress,
        contractname: contractName,
        compilerversion: compilerVersion,
        licenseType: "12", // Apache-2.0
        constructorArguements: constructorArgs,
      });
      const body = params.toString();
      return new Promise((resolve, reject) => {
        const req = https.request(
          { hostname: "api.etherscan.io", path: "/v2/api?chainid=" + chainId, method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) } },
          (res) => { let d = ""; res.on("data", (c) => d += c); res.on("end", () => {
            const j = JSON.parse(d);
            resolve(j.status === "1" ? j.result : "FAIL:" + j.result);
          }); },
        );
        req.on("error", reject);
        req.write(body);
        req.end();
      });
    }

    function pollVerify(guid: string): Promise<string> {
      return new Promise((resolve) => {
        let i = 0;
        const tick = () => {
          setTimeout(() => {
            const url = `https://api.etherscan.io/v2/api?chainid=${chainId}&module=contract&action=checkverifystatus&guid=${guid}&apikey=${BASESCAN_API_KEY}`;
            https.get(url, (res) => {
              let s = ""; res.on("data", (c) => s += c); res.on("end", () => {
                const j = JSON.parse(s);
                if (j.result && !j.result.startsWith("Pending")) { resolve(j.result); return; }
                console.log("  verification pending...");
                if (++i < 24) tick(); else resolve("timeout");
              });
            }).on("error", () => { if (++i < 24) tick(); else resolve("timeout"); });
          }, 5000);
        };
        tick();
      });
    }

    console.log("Submitting GitVaultFactory for verification...");
    const guid1 = await submitVerifyV2(
      factoryAddress,
      "src/GitVaultFactory.sol:GitVaultFactory",
      factoryArgsEncoded,
    );
    if (guid1.startsWith("FAIL")) {
      console.warn("Factory verification submit failed:", guid1);
    } else {
      console.log("Factory GUID:", guid1, "— polling...");
      const s1 = await pollVerify(guid1);
      console.log("Factory verification:", s1);
    }

    console.log("Submitting GitVault impl for verification...");
    const guid2 = await submitVerifyV2(
      implAddress,
      "src/GitVault.sol:GitVault",
      "",
    );
    if (guid2.startsWith("FAIL")) {
      console.warn("Impl verification submit failed:", guid2);
    } else {
      console.log("Impl GUID:", guid2, "— polling...");
      const s2 = await pollVerify(guid2);
      console.log("Impl verification:", s2);
    }
  }

  console.log("\nBasescan links:");
  console.log("Factory:", explorer + "/address/" + factoryAddress + "#code");
  console.log("Impl:   ", explorer + "/address/" + implAddress + "#code");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
