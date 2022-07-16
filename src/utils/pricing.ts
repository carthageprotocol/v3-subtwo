/* eslint-disable prefer-const */
import { ONE_BD, ZERO_BD, ZERO_BI } from './constants'
import { Bundle, Pool, Token } from './../types/schema'
import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import { exponentToBigDecimal, safeDiv } from '../utils/index'

const WETH_ADDRESS = '0xb750990f953b36f806d0327678ecfb4eefd16979'
const USDC_WETH_03_POOL = '0x4F4E1ccFa1D3B5730372f5C89B1dF248F56CBbE4' //updated to cndl version

// token where amounts should contribute to tracked volume and liquidity
// usually tokens that many tokens are paired with s
export let WHITELIST_TOKENS: string[] = [
  '0x85FA00f55492B0437b3925381fAaf0E024747627', // WCNDL
  '0xad43669cbAC863e33449d423261E525de8da0Ff4', // DAI  - updated to cndl version
  '0x95A0A7953F9292838C0614D690005D5c716E718E', // USDC  - updated to cndl version
  '0x5c17C48F127D6aE5794b2404F1F8A5CeED419eDf', // ZED
  '0xa018034190943D6c8E10218d9F8E8Af491272411', // SHIBA
  '0xb750990F953B36F806d0327678eCFB4eEFd16979', // WETH
  '0x54D94162d5d7DAa54dBdB2D37F8cdA71D7d6795c'  // USDT
//  '0x39aa39c021dfbae8fac545936693ac917d5e7563', // cUSDC
//  '0x86fadb80d8d2cff3c3680819e4da99c10232ba0f', // EBASE
//  '0x57ab1ec28d129707052df4df418d58a2d46d5f51', // sUSD
//  '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2', // MKR
//  '0xc00e94cb662c3520282e6f5717214004a7f26888', // COMP
//  '0x514910771af9ca656af840dff83e8264ecf986ca', // LINK
//  '0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e', // YFI
//  '0x111111111117dc0aa78b770fa6a738034120c302', // 1INCH
//  '0xdf5e0e81dff6faf3a7e52ba697820c5e32d806a8', // yCurv
//  '0x956f47f50a910163d8bf957cf5846d573e7f87ca', // FEI
//  '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0', // MATIC  - updated to cndl version
//  '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', // AAVE
  //'0xfe2e637202056d30016725477c5da089ab0a043a'  // sETH2
]

let STABLE_COINS: string[] = [
  '0xad43669cbAC863e33449d423261E525de8da0Ff4', // DAI  updated to cndl version
  '0x95A0A7953F9292838C0614D690005D5c716E718E', // USDC  - updated to cndl version
  '0x54D94162d5d7DAa54dBdB2D37F8cdA71D7d6795c'  // USDT - updated to cndl
//  '0x0000000000085d4780b73119b644ae5ecd22b376',
//  '0x956f47f50a910163d8bf957cf5846d573e7f87ca',
//  '0x4dd28568d05f09b02220b09c2cb307bfd837cb95'
]

let MINIMUM_ETH_LOCKED = BigDecimal.fromString('2')

let Q192 = 2 ** 192
export function sqrtPriceX96ToTokenPrices(sqrtPriceX96: BigInt, token0: Token, token1: Token): BigDecimal[] {
  let num = sqrtPriceX96.times(sqrtPriceX96).toBigDecimal()
  let denom = BigDecimal.fromString(Q192.toString())
  let price1 = num
    .div(denom)
    .times(exponentToBigDecimal(token0.decimals))
    .div(exponentToBigDecimal(token1.decimals))

  let price0 = safeDiv(BigDecimal.fromString('1'), price1)
  return [price0, price1]
}

export function getEthPriceInUSD(): BigDecimal {
  // fetch eth prices for each stablecoin
  let usdcPool = Pool.load(USDC_WETH_03_POOL) // dai is token0
  if (usdcPool !== null) {
    return usdcPool.token0Price
  } else {
    return ZERO_BD
  }
}

/**
 * Search through graph to find derived Eth per token.
 * @todo update to be derived ETH (add stablecoin estimates)
 **/
export function findEthPerToken(token: Token): BigDecimal {
  if (token.id == WETH_ADDRESS) {
    return ONE_BD
  }

  let whiteList = token.whitelistPools
  // for now just take USD from pool with greatest TVL
  // need to update this to actually detect best rate based on liquidity distribution
  let largestLiquidityETH = ZERO_BD
  let priceSoFar = ZERO_BD
  let bundle = Bundle.load('1')

  // hardcoded fix for incorrect rates
  // if whitelist includes token - get the safe price
  if (STABLE_COINS.includes(token.id)) {
    priceSoFar = safeDiv(ONE_BD, bundle.ethPriceUSD)
  } else {
    for (let i = 0; i < whiteList.length; ++i) {
      let poolAddress = whiteList[i]
      let pool = Pool.load(poolAddress)

      if (pool.liquidity.gt(ZERO_BI)) {
        if (pool.token0 == token.id) {
          // whitelist token is token1
          let token1 = Token.load(pool.token1)
          // get the derived ETH in pool
          let ethLocked = pool.totalValueLockedToken1.times(token1.derivedETH)
          if (ethLocked.gt(largestLiquidityETH) && ethLocked.gt(MINIMUM_ETH_LOCKED) || WHITELIST_TOKENS.includes(pool.token0)) {
            largestLiquidityETH = ethLocked
            // token1 per our token * Eth per token1
            priceSoFar = pool.token1Price.times(token1.derivedETH as BigDecimal)
          }
        }
        if (pool.token1 == token.id) {
          let token0 = Token.load(pool.token0)
          // get the derived ETH in pool
          let ethLocked = pool.totalValueLockedToken0.times(token0.derivedETH)
          if (ethLocked.gt(largestLiquidityETH) && ethLocked.gt(MINIMUM_ETH_LOCKED) || WHITELIST_TOKENS.includes(pool.token1)) {
            largestLiquidityETH = ethLocked
            // token0 per our token * ETH per token0
            priceSoFar = pool.token0Price.times(token0.derivedETH as BigDecimal)
          }
        }
      }
    }
  }
  return priceSoFar // nothing was found return 0
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
export function getTrackedAmountUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let bundle = Bundle.load('1')
  let price0USD = token0.derivedETH.times(bundle.ethPriceUSD)
  let price1USD = token1.derivedETH.times(bundle.ethPriceUSD)

  // both are whitelist tokens, return sum of both amounts
  if (WHITELIST_TOKENS.includes(token0.id) && WHITELIST_TOKENS.includes(token1.id)) {
    return tokenAmount0.times(price0USD).plus(tokenAmount1.times(price1USD))
  }

  // take double value of the whitelisted token amount
  if (WHITELIST_TOKENS.includes(token0.id) && !WHITELIST_TOKENS.includes(token1.id)) {
    return tokenAmount0.times(price0USD).times(BigDecimal.fromString('2'))
  }

  // take double value of the whitelisted token amount
  if (!WHITELIST_TOKENS.includes(token0.id) && WHITELIST_TOKENS.includes(token1.id)) {
    return tokenAmount1.times(price1USD).times(BigDecimal.fromString('2'))
  }

  // neither token is on white list, tracked amount is 0
  return ZERO_BD
}
