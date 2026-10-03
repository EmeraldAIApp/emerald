// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {
    FACTORY,
    FEE_ESCROW,
    WETH,
    NAME,
    SYMBOL,
    FEE_PPM,
    FEES_TO_HOLDERS,
    CREATOR_PPM,
    PLATFORM_PPM,
    PPM,
    PoolKey,
    LaunchParams,
    Launch,
    ILaunchFactory,
    ILaunchHook,
    IFeeEscrow,
    ILaunchRouter,
    ILaunchToken
} from "../src/Stockereum.sol";

interface IERC20Balance {
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Fork tests of the $EMERALD fee split at the launch page's "2%" preset (feePpm 20000, feesToHolders off).
/// Run with: MAINNET_RPC_URL=https://ethereum-rpc.publicnode.com forge test -vv
/// Without MAINNET_RPC_URL every test is skipped (not failed).
contract StockereumLaunchTest is Test {
    uint256 constant SIGNER_PK = 0xA11CE;
    bytes32 constant PRICE_TYPEHASH = keccak256("QuotePrice(address quote,uint256 usdPrice,uint256 deadline)");
    uint256 constant DEV_BUY = 0.05 ether;

    ILaunchFactory factory = ILaunchFactory(FACTORY);
    IFeeEscrow escrow = IFeeEscrow(FEE_ESCROW);
    address creator;
    address buyer;
    address platform;
    bool forked;

    function setUp() public {
        string memory rpc = vm.envOr("MAINNET_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        forked = true;
        creator = makeAddr("emerald-creator");
        buyer = makeAddr("emerald-buyer");
        // makeAddr labels can collide with real mainnet contracts: force plain EOAs.
        vm.etch(creator, "");
        vm.etch(buyer, "");
        vm.deal(creator, 1 ether);
        vm.deal(buyer, 10 ether);
        platform = escrow.platformRecipient();
        // The real price signer is Stockereum's server; on the fork we swap in a local key to sign the ETH price.
        vm.prank(factory.owner());
        factory.setPriceSigner(vm.addr(SIGNER_PK));
    }

    modifier onlyFork() {
        if (!forked) {
            vm.skip(true);
            return;
        }
        _;
    }

    function _sign(uint256 usdPrice, uint256 deadline) internal view returns (bytes memory) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("StockpadLaunchFactory"),
                keccak256("1"),
                block.chainid,
                FACTORY
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", domain, keccak256(abi.encode(PRICE_TYPEHASH, WETH, usdPrice, deadline)))
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_PK, digest);
        return abi.encodePacked(r, s, v);
    }

    /// The call Stockereum's launch page sends from the creator wallet: create the pool and dev-buy in one tx.
    function _launch(bool feesToHolders) internal returns (address token, PoolKey memory key, bytes32 poolId) {
        uint256 deadline = block.timestamp + 600;
        LaunchParams memory p = LaunchParams({
            name: NAME,
            symbol: SYMBOL,
            metadataUri: '{"description":"fork rehearsal"}',
            quote: WETH,
            quoteUsdPrice: 2_600e18,
            priceDeadline: deadline,
            priceSignature: _sign(2_600e18, deadline),
            feePpm: FEE_PPM,
            feesToHolders: feesToHolders
        });
        uint256 value = factory.creationFee() + DEV_BUY; // read before the prank: the prank covers the next call only
        vm.prank(creator);
        (token,, poolId) = factory.createLaunchAndBuy{value: value}(p, 0);
        // Same PoolKey that scripts/launch/verify.ts rebuilds from the token (WETH/token sorted, fee 0, spacing 200).
        (address c0, address c1) = WETH < token ? (WETH, token) : (token, WETH);
        key = PoolKey({currency0: c0, currency1: c1, fee: 0, tickSpacing: 200, hooks: factory.hook()});
        assertEq(keccak256(abi.encode(key)), poolId, "PoolKey rebuilt from the token must hash to poolId");
    }

    function _claimable(address who) internal view returns (uint256) {
        return escrow.claimable(who, WETH);
    }

    // Launch-day preflight (runbook section 2, row 5): what the launch page does not show before the clicks.
    function test_preflight_factoryOpen_escrowAndPlatformFeeUnchanged() public onlyFork {
        ILaunchHook hook = ILaunchHook(factory.hook());
        assertFalse(factory.paused(), "factory paused");
        assertEq(hook.escrow(), FEE_ESCROW, "escrow changed");
        assertEq(hook.platformFeeFor(FEE_PPM), PLATFORM_PPM, "platform fee changed");
        (bool wethEnabled,,) = factory.quotes(WETH);
        assertTrue(wethEnabled, "WETH quote disabled");
        console2.log("CREATION_FEE_WEI=%s", vm.toString(factory.creationFee()));
    }

    function test_twoPercentLaunch_locks20000_andCreatorAsRecipient() public onlyFork {
        uint256 platformBefore = _claimable(platform);
        (address token,, bytes32 poolId) = _launch(FEES_TO_HOLDERS);

        Launch memory l = ILaunchHook(factory.hook()).getLaunch(poolId);
        assertEq(l.token, token);
        assertEq(l.feePpm, 20_000);
        assertFalse(l.feesToHolders);
        assertEq(l.feeRecipient, creator);
        assertEq(ILaunchToken(token).distributor(), address(0));
        assertEq(ILaunchToken(token).creator(), creator);
        // the dev buy pays the flat 2 % (no anti-snipe): 1 % to the creator, 1 % to the platform
        assertEq(_claimable(creator), DEV_BUY * CREATOR_PPM / PPM);
        assertEq(_claimable(platform) - platformBefore, DEV_BUY * FEE_PPM / PPM - DEV_BUY * CREATOR_PPM / PPM);
        assertGt(ILaunchToken(token).balanceOf(creator), 0);
        console2.log("EMERALD_TOKEN=%s", token);
        console2.log("EMERALD_POOL_ID=%s", vm.toString(poolId));
        console2.log("CREATOR_CLAIMABLE_WEI=%s", vm.toString(_claimable(creator)));
    }

    function test_buyAfterAntiSnipe_splits1and1() public onlyFork {
        (, PoolKey memory key,) = _launch(FEES_TO_HOLDERS);
        vm.warp(block.timestamp + 20);
        uint256 creatorBefore = _claimable(creator);
        uint256 platformBefore = _claimable(platform);

        vm.prank(buyer);
        ILaunchRouter(factory.router()).buyWethPairWithEth{value: 1 ether}(key, 0, "");

        assertEq(_claimable(creator) - creatorBefore, 0.01 ether);
        assertEq(_claimable(platform) - platformBefore, 0.01 ether);
    }

    function test_sellAfterAntiSnipe_splits1and1() public onlyFork {
        (address token, PoolKey memory key,) = _launch(FEES_TO_HOLDERS);
        vm.warp(block.timestamp + 20);
        ILaunchRouter router = ILaunchRouter(factory.router());
        vm.prank(buyer);
        router.buyWethPairWithEth{value: 1 ether}(key, 0, "");
        uint256 amount = ILaunchToken(token).balanceOf(buyer);
        uint256 creatorBefore = _claimable(creator);
        uint256 platformBefore = _claimable(platform);

        vm.startPrank(buyer);
        ILaunchToken(token).approve(address(router), amount);
        uint256 ethOut = router.sellWethPairForEth(key, token, amount, 0, "");
        vm.stopPrank();

        uint256 toCreator = _claimable(creator) - creatorBefore;
        uint256 toPlatform = _claimable(platform) - platformBefore;
        uint256 gross = ethOut + toCreator + toPlatform; // the seller pays the fee out of what they receive
        assertEq(toCreator, gross * CREATOR_PPM / PPM);
        assertApproxEqAbs(toCreator + toPlatform, gross * FEE_PPM / PPM, 1);
    }

    function test_antiSnipeExcess_goesToPlatform_creatorStill1() public onlyFork {
        (, PoolKey memory key,) = _launch(FEES_TO_HOLDERS);
        vm.warp(block.timestamp + 5); // inside the 20 s window: the fee is ~74.75 %
        uint256 creatorBefore = _claimable(creator);
        uint256 platformBefore = _claimable(platform);

        vm.prank(buyer);
        ILaunchRouter(factory.router()).buyWethPairWithEth{value: 0.1 ether}(key, 0, "");

        assertEq(_claimable(creator) - creatorBefore, 0.1 ether * CREATOR_PPM / PPM);
        assertGt(_claimable(platform) - platformBefore, 0.07 ether);
    }

    function test_creatorClaimsWeth() public onlyFork {
        _launch(FEES_TO_HOLDERS);
        uint256 owed = _claimable(creator);

        vm.prank(creator);
        escrow.claim(WETH, creator);

        assertEq(IERC20Balance(WETH).balanceOf(creator), owed);
        assertEq(_claimable(creator), 0);
    }

    function test_feesToHoldersOn_wouldRouteEverythingAwayFromCreator() public onlyFork {
        (address token,, bytes32 poolId) = _launch(true);

        Launch memory l = ILaunchHook(factory.hook()).getLaunch(poolId);
        assertTrue(l.feesToHolders);
        assertEq(l.feeRecipient, ILaunchToken(token).distributor());
        assertTrue(l.feeRecipient != creator);
        assertEq(_claimable(creator), 0);
    }
}
