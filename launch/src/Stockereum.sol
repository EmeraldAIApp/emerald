// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.26;

// Interfaces of the Stockereum contracts on Ethereum mainnet, copied from the sources verified on Sourcify
// (exact_match, 2026-09-05): LaunchFactory, LaunchHook, FeeEscrow, LaunchToken, and LaunchRouter (2026-09-23).
// $EMERALD is launched by hand from Stockereum's launch page. The constants below are what that page sends for the
// "2%" preset with fees to holders off; the fork tests and scripts/verify-launch.ts check exactly these values.

address constant FACTORY = 0xc6B080DEd03C3382476A76345e79f82BD480977B;
address constant FEE_ESCROW = 0xAcefe251da006887dA41C063D06CC82A060824BA;
address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

string constant NAME = "Emerald";
string constant SYMBOL = "EMERALD";
uint24 constant FEE_PPM = 20_000; // 2 % per trade: the launch page's "2%" preset
bool constant FEES_TO_HOLDERS = false; // IRREVERSIBLE: true would send the creator share to a holder distributor forever
uint256 constant CREATOR_PPM = 10_000; // FEE_PPM - LaunchHook.platformFeeFor(20_000): 1 % to the creator
uint256 constant PLATFORM_PPM = 10_000; // LaunchHook.platformFeeFor(20_000): 1 % to Stockereum
uint256 constant PPM = 1_000_000;

struct PoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

struct LaunchParams {
    string name;
    string symbol;
    string metadataUri;
    address quote;
    uint256 quoteUsdPrice;
    uint256 priceDeadline;
    bytes priceSignature;
    uint24 feePpm;
    bool feesToHolders;
}

struct Launch {
    address token;
    address feeRecipient;
    address quote;
    uint40 openedAt;
    uint24 feePpm;
    bool quoteIsCurrency0;
    bool pendingDevBuy;
    bool feesToHolders;
    address devBuyer;
    int24 tickLower;
    int24 tickUpper;
    uint128 liquidity;
}

interface ILaunchFactory {
    function owner() external view returns (address);
    function setPriceSigner(address signer) external;
    function creationFee() external view returns (uint256);
    function paused() external view returns (bool);
    function router() external view returns (address);
    function hook() external view returns (address);
    function quotes(address quote) external view returns (bool enabled, uint8 decimals, string memory symbol);
    function createLaunchAndBuy(LaunchParams calldata p, uint256 minOut)
        external
        payable
        returns (address token, PoolKey memory key, bytes32 poolId);
}

interface ILaunchHook {
    function escrow() external view returns (address);
    function platformFeeFor(uint24 feePpm) external pure returns (uint256);
    function getLaunch(bytes32 poolId) external view returns (Launch memory);
}

interface IFeeEscrow {
    function claimable(address account, address currency) external view returns (uint256);
    function platformRecipient() external view returns (address);
    function claim(address currency, address to) external returns (uint256);
}

interface ILaunchRouter {
    function buyWethPairWithEth(PoolKey calldata key, uint256 minOut, bytes calldata hookData)
        external
        payable
        returns (uint256);
    function sellWethPairForEth(
        PoolKey calldata key,
        address token,
        uint256 amountIn,
        uint256 minOut,
        bytes calldata hookData
    ) external returns (uint256);
}

interface ILaunchToken {
    function creator() external view returns (address);
    function distributor() external view returns (address);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}
