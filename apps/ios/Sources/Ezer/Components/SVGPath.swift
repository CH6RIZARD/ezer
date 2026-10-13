// SVG path data (`d` strings) -> SwiftUI Path, the react-native-svg <Path d=…> equivalent.
// Shared by MerchantMark (the 24x24 brand marks) and Card Studio / CardCanvas strokes.
//
// Full path grammar: M L H V C S Q T A Z, absolute and relative, implicit command repeats
// (extra pairs after M are L), compact numbers ("-.6", "1.5.5", "0-.3") and compact arc flags
// ("a.517.517 0 01-.512.511"). Arcs are converted to cubic Béziers. Fill rule nonzero (RN svg default).
//
//   SVGPathShape(d: logo.d, viewBox: CGRect(x: 0, y: 0, width: 24, height: 24)).fill(fg)
//   let p = SVGPath.parse(stroke.d)   // in the d-string's own coordinates

import SwiftUI

enum SVGPath {
    static func parse(_ d: String) -> Path {
        var s = Scanner(Array(d.utf8))
        var path = Path()
        var cur = CGPoint.zero
        var start = CGPoint.zero
        var lastCubicCtrl: CGPoint?
        var lastQuadCtrl: CGPoint?
        var cmd: UInt8 = 0

        while true {
            s.skipSeparators()
            guard let c = s.peek() else { break }
            if isCommand(c) {
                cmd = c
                s.advance()
            } else if cmd == 0 {
                break // garbage before any command
            }
            let rel = cmd >= 97 // lowercase
            let upper = rel ? cmd - 32 : cmd

            func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { rel ? CGPoint(x: cur.x + x, y: cur.y + y) : CGPoint(x: x, y: y) }

            switch upper {
            case UInt8(ascii: "Z"):
                path.closeSubpath()
                cur = start
                lastCubicCtrl = nil; lastQuadCtrl = nil
                // Z takes no arguments; a following number would be malformed — stop at it.
                s.skipSeparators()
                if let n = s.peek(), !isCommand(n) { return path }
                continue
            case UInt8(ascii: "M"):
                guard let x = s.number(), let y = s.number() else { return path }
                let p = pt(x, y)
                path.move(to: p)
                cur = p; start = p
                lastCubicCtrl = nil; lastQuadCtrl = nil
                // After M/m, implicit pairs are L/l.
                cmd = rel ? UInt8(ascii: "l") : UInt8(ascii: "L")
            case UInt8(ascii: "L"):
                guard let x = s.number(), let y = s.number() else { return path }
                let p = pt(x, y)
                path.addLine(to: p)
                cur = p
                lastCubicCtrl = nil; lastQuadCtrl = nil
            case UInt8(ascii: "H"):
                guard let x = s.number() else { return path }
                let p = CGPoint(x: rel ? cur.x + x : x, y: cur.y)
                path.addLine(to: p)
                cur = p
                lastCubicCtrl = nil; lastQuadCtrl = nil
            case UInt8(ascii: "V"):
                guard let y = s.number() else { return path }
                let p = CGPoint(x: cur.x, y: rel ? cur.y + y : y)
                path.addLine(to: p)
                cur = p
                lastCubicCtrl = nil; lastQuadCtrl = nil
            case UInt8(ascii: "C"):
                guard let x1 = s.number(), let y1 = s.number(), let x2 = s.number(), let y2 = s.number(),
                      let x = s.number(), let y = s.number() else { return path }
                let c1 = pt(x1, y1), c2 = pt(x2, y2), p = pt(x, y)
                path.addCurve(to: p, control1: c1, control2: c2)
                cur = p
                lastCubicCtrl = c2; lastQuadCtrl = nil
            case UInt8(ascii: "S"):
                guard let x2 = s.number(), let y2 = s.number(), let x = s.number(), let y = s.number() else { return path }
                let c1 = lastCubicCtrl.map { CGPoint(x: 2 * cur.x - $0.x, y: 2 * cur.y - $0.y) } ?? cur
                let c2 = pt(x2, y2), p = pt(x, y)
                path.addCurve(to: p, control1: c1, control2: c2)
                cur = p
                lastCubicCtrl = c2; lastQuadCtrl = nil
            case UInt8(ascii: "Q"):
                guard let x1 = s.number(), let y1 = s.number(), let x = s.number(), let y = s.number() else { return path }
                let c1 = pt(x1, y1), p = pt(x, y)
                path.addQuadCurve(to: p, control: c1)
                cur = p
                lastQuadCtrl = c1; lastCubicCtrl = nil
            case UInt8(ascii: "T"):
                guard let x = s.number(), let y = s.number() else { return path }
                let c1 = lastQuadCtrl.map { CGPoint(x: 2 * cur.x - $0.x, y: 2 * cur.y - $0.y) } ?? cur
                let p = pt(x, y)
                path.addQuadCurve(to: p, control: c1)
                cur = p
                lastQuadCtrl = c1; lastCubicCtrl = nil
            case UInt8(ascii: "A"):
                guard let rx = s.number(), let ry = s.number(), let rot = s.number(),
                      let large = s.flag(), let sweep = s.flag(),
                      let x = s.number(), let y = s.number() else { return path }
                let p = pt(x, y)
                addArc(&path, from: cur, to: p, rx: rx, ry: ry, xAxisRotation: rot, largeArc: large, sweep: sweep)
                cur = p
                lastCubicCtrl = nil; lastQuadCtrl = nil
            default:
                return path
            }
        }
        return path
    }

    private static func isCommand(_ c: UInt8) -> Bool {
        switch c {
        case UInt8(ascii: "M"), UInt8(ascii: "m"), UInt8(ascii: "L"), UInt8(ascii: "l"), UInt8(ascii: "H"), UInt8(ascii: "h"),
             UInt8(ascii: "V"), UInt8(ascii: "v"), UInt8(ascii: "C"), UInt8(ascii: "c"), UInt8(ascii: "S"), UInt8(ascii: "s"),
             UInt8(ascii: "Q"), UInt8(ascii: "q"), UInt8(ascii: "T"), UInt8(ascii: "t"), UInt8(ascii: "A"), UInt8(ascii: "a"),
             UInt8(ascii: "Z"), UInt8(ascii: "z"):
            return true
        default:
            return false
        }
    }

    /// SVG endpoint arc -> centre parameterisation -> cubic Bézier segments of at most 90°.
    private static func addArc(_ path: inout Path, from p0: CGPoint, to p1: CGPoint, rx rxIn: CGFloat, ry ryIn: CGFloat,
                               xAxisRotation: CGFloat, largeArc: Bool, sweep: Bool) {
        if p0 == p1 { return }
        var rx = abs(rxIn), ry = abs(ryIn)
        if rx == 0 || ry == 0 {
            path.addLine(to: p1)
            return
        }
        let phi = xAxisRotation * .pi / 180
        let cosPhi = cos(phi), sinPhi = sin(phi)
        let dx = (p0.x - p1.x) / 2, dy = (p0.y - p1.y) / 2
        let x1p = cosPhi * dx + sinPhi * dy
        let y1p = -sinPhi * dx + cosPhi * dy

        // Correct out-of-range radii.
        let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
        if lambda > 1 {
            let k = sqrt(lambda)
            rx *= k; ry *= k
        }
        let rx2 = rx * rx, ry2 = ry * ry
        var num = rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p
        if num < 0 { num = 0 }
        let den = rx2 * y1p * y1p + ry2 * x1p * x1p
        var coef = den == 0 ? 0 : sqrt(num / den)
        if largeArc == sweep { coef = -coef }
        let cxp = coef * (rx * y1p / ry)
        let cyp = coef * -(ry * x1p / rx)
        let cx = cosPhi * cxp - sinPhi * cyp + (p0.x + p1.x) / 2
        let cy = sinPhi * cxp + cosPhi * cyp + (p0.y + p1.y) / 2

        func angle(_ ux: CGFloat, _ uy: CGFloat, _ vx: CGFloat, _ vy: CGFloat) -> CGFloat {
            let dot = ux * vx + uy * vy
            let len = sqrt(ux * ux + uy * uy) * sqrt(vx * vx + vy * vy)
            var a = acos(max(-1, min(1, dot / len)))
            if ux * vy - uy * vx < 0 { a = -a }
            return a
        }
        let theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
        var dTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
        if !sweep && dTheta > 0 { dTheta -= 2 * .pi }
        if sweep && dTheta < 0 { dTheta += 2 * .pi }

        let segments = max(1, Int(ceil(abs(dTheta) / (.pi / 2))))
        let delta = dTheta / CGFloat(segments)
        let t = 4 / 3 * tan(delta / 4)
        var th = theta1
        for _ in 0..<segments {
            let cos1 = cos(th), sin1 = sin(th)
            let th2 = th + delta
            let cos2 = cos(th2), sin2 = sin(th2)
            // Unit-circle control points, then scale/rotate/translate.
            let e1 = CGPoint(x: cos1 - t * sin1, y: sin1 + t * cos1)
            let e2 = CGPoint(x: cos2 + t * sin2, y: sin2 - t * cos2)
            let e3 = CGPoint(x: cos2, y: sin2)
            func map(_ e: CGPoint) -> CGPoint {
                let x = e.x * rx, y = e.y * ry
                return CGPoint(x: cosPhi * x - sinPhi * y + cx, y: sinPhi * x + cosPhi * y + cy)
            }
            path.addCurve(to: map(e3), control1: map(e1), control2: map(e2))
            th = th2
        }
    }

    /// Byte scanner for the path grammar.
    private struct Scanner {
        let b: [UInt8]
        var i = 0
        init(_ b: [UInt8]) { self.b = b }

        func peek() -> UInt8? { i < b.count ? b[i] : nil }
        mutating func advance() { i += 1 }

        mutating func skipSeparators() {
            while i < b.count, b[i] == 32 || b[i] == 9 || b[i] == 10 || b[i] == 13 || b[i] == 12 || b[i] == 44 { i += 1 }
        }

        /// One arc flag: a single '0' or '1', separators optional.
        mutating func flag() -> Bool? {
            skipSeparators()
            guard i < b.count else { return nil }
            if b[i] == 48 { i += 1; return false }
            if b[i] == 49 { i += 1; return true }
            return nil
        }

        mutating func number() -> CGFloat? {
            skipSeparators()
            let startIdx = i
            if i < b.count, b[i] == 43 || b[i] == 45 { i += 1 } // + -
            var sawDigit = false, sawDot = false
            while i < b.count {
                let c = b[i]
                if c >= 48 && c <= 57 { sawDigit = true; i += 1 }
                else if c == 46 && !sawDot { sawDot = true; i += 1 }
                else { break }
            }
            if !sawDigit { i = startIdx; return nil }
            // exponent
            if i < b.count, b[i] == 101 || b[i] == 69 {
                var j = i + 1
                if j < b.count, b[j] == 43 || b[j] == 45 { j += 1 }
                if j < b.count, b[j] >= 48 && b[j] <= 57 {
                    while j < b.count, b[j] >= 48 && b[j] <= 57 { j += 1 }
                    i = j
                }
            }
            guard let str = String(bytes: b[startIdx..<i], encoding: .ascii), let v = Double(str) else { return nil }
            return CGFloat(v)
        }
    }
}

/// A `d` string as a Shape, scaled from its viewBox into the frame (preserveAspectRatio xMidYMid meet,
/// react-native-svg's default).
struct SVGPathShape: Shape {
    let d: String
    var viewBox: CGRect = CGRect(x: 0, y: 0, width: 24, height: 24)

    func path(in rect: CGRect) -> Path {
        let p = SVGPath.parse(d)
        guard viewBox.width > 0, viewBox.height > 0 else { return p }
        let scale = min(rect.width / viewBox.width, rect.height / viewBox.height)
        let ox = rect.minX + (rect.width - viewBox.width * scale) / 2 - viewBox.minX * scale
        let oy = rect.minY + (rect.height - viewBox.height * scale) / 2 - viewBox.minY * scale
        return p.applying(CGAffineTransform(a: scale, b: 0, c: 0, d: scale, tx: ox, ty: oy))
    }
}
