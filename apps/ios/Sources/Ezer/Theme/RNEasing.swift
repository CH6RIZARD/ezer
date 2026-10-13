// React Native's Easing module and default timings, evaluated exactly (port map §1.6).
//
// RN defaults the code relies on WITHOUT spelling them out:
//   Animated.timing, no easing  -> 500ms, Easing.inOut(Easing.ease)   => .rn(.rnDefault, ms)
//   Reanimated withTiming, none -> 300ms, Easing.inOut(Easing.quad)   => .rn(.reanimatedDefault, 300)
// Named curves: motion.easeOut (0.23,1,0.32,1) => RNEasing.easeOut; motion.cardSettleBezier
// (0.22,1,0.36,1) => RNEasing.cardSettle.
//
//   withAnimation(.rn(.easeOut, 240)) { on = 1 }

import SwiftUI

indirect enum RNEasing: Hashable, Sendable {
    case linear
    /// Easing.ease = cubic-bezier(0.42, 0, 1, 1) (RN's definition, NOT CSS `ease`).
    case ease
    case quad
    case cubic
    case bezier(Double, Double, Double, Double)
    case `in`(RNEasing)
    case out(RNEasing)
    case inOut(RNEasing)

    /// Animated.timing's default curve.
    static let rnDefault: RNEasing = .inOut(.ease)
    /// Reanimated withTiming's default curve.
    static let reanimatedDefault: RNEasing = .inOut(.quad)
    /// motion.easeOut — enter / press.
    static let easeOut: RNEasing = .bezier(0.23, 1, 0.32, 1)
    /// motion.cardSettleBezier — also the theme pill / Spending Power slide.
    static let cardSettle: RNEasing = .bezier(0.22, 1, 0.36, 1)

    func callAsFunction(_ t: Double) -> Double {
        let t = min(1, max(0, t))
        switch self {
        case .linear: return t
        case .ease: return UnitBezier(0.42, 0, 1, 1).solve(t)
        case .quad: return t * t
        case .cubic: return t * t * t
        case let .bezier(x1, y1, x2, y2): return UnitBezier(x1, y1, x2, y2).solve(t)
        case let .in(f): return f(t)
        case let .out(f): return 1 - f(1 - t)
        case let .inOut(f): return t < 0.5 ? f(t * 2) / 2 : 1 - f((1 - t) * 2) / 2
        }
    }
}

/// CSS cubic-bezier: solve x(s) = t, return y(s). Same algorithm as RN's bezier.js / WebKit.
struct UnitBezier {
    let cx, bx, ax, cy, by, ay: Double
    init(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double) {
        cx = 3 * x1; bx = 3 * (x2 - x1) - cx; ax = 1 - cx - bx
        cy = 3 * y1; by = 3 * (y2 - y1) - cy; ay = 1 - cy - by
    }
    private func x(_ s: Double) -> Double { ((ax * s + bx) * s + cx) * s }
    private func y(_ s: Double) -> Double { ((ay * s + by) * s + cy) * s }
    private func dx(_ s: Double) -> Double { (3 * ax * s + 2 * bx) * s + cx }

    func solve(_ t: Double) -> Double {
        if t <= 0 { return 0 }
        if t >= 1 { return 1 }
        // Newton-Raphson first, then bisection.
        var s = t
        for _ in 0..<8 {
            let err = x(s) - t
            if abs(err) < 1e-7 { return y(s) }
            let d = dx(s)
            if abs(d) < 1e-6 { break }
            s -= err / d
        }
        var lo = 0.0, hi = 1.0
        s = t
        for _ in 0..<64 {
            let v = x(s)
            if abs(v - t) < 1e-7 { break }
            if v < t { lo = s } else { hi = s }
            s = (lo + hi) / 2
        }
        return y(s)
    }
}

/// A SwiftUI animation that follows an RN easing curve exactly over `duration` seconds.
struct RNTimingAnimation: CustomAnimation {
    let easing: RNEasing
    let duration: TimeInterval

    func animate<V: VectorArithmetic>(value: V, time: TimeInterval, context: inout AnimationContext<V>) -> V? {
        guard duration > 0, time < duration else { return nil }
        return value.scaled(by: easing(time / duration))
    }
}

extension Animation {
    /// RN timing: `Animated.timing(v, { duration: ms, easing })` / `withTiming(v, { duration: ms, easing })`.
    /// 0ms is an immediate change, like RN.
    static func rn(_ easing: RNEasing = .rnDefault, _ ms: Double) -> Animation {
        if ms <= 0 { return .linear(duration: 0) }
        return Animation(RNTimingAnimation(easing: easing, duration: ms / 1000))
    }
}

/// Runs `body` with animations disabled (RN `setValue`).
@MainActor
func withoutAnimation(_ body: () -> Void) {
    var t = Transaction()
    t.disablesAnimations = true
    withTransaction(t, body)
}
