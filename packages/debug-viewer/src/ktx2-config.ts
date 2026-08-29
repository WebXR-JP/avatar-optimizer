/**
 * KTX2 トランスコーダの配信元設定
 *
 * 既定では jsdelivr の CDN から取得されるが、外部依存を避けるため
 * 同一オリジン (public/basis/) から配信する。実体は scripts/copy-basis.mjs が
 * three の node_modules からコピーする。
 *
 * ESM の import は巻き上げられるため、main.tsx にベタ書きすると
 * App 側のモジュールが評価された後に実行されてしまう。
 * 独立したモジュールにして main.tsx の先頭で import することで、
 * 他のモジュールより先に評価されることを保証している。
 */
import { setKtx2TranscoderPath } from '@webxr-jp/avatar-optimizer'

setKtx2TranscoderPath('/basis/')
