// RN `<Image source={{ uri }} onLoad onError>` for remote and data: URIs: one in-memory cache,
// and the decoded PIXEL size handed to the caller (MerchantMark rejects the favicon CDN's 16px
// globe exactly like RN's onLoad did). Used for merchant logos and bank logos (networkArt).
//
//   RemoteImage(uri: url) { phase in
//       switch phase { case .loading: initialTile; case .failure: initialTile; case .success(let img, _): img.resizable() }
//   }

import SwiftUI
import UIKit

enum RemoteImagePhase {
    case loading
    case success(Image, pixelSize: CGSize)
    case failure
}

@MainActor
final class RemoteImageCache {
    static let shared = RemoteImageCache()
    private let cache = NSCache<NSString, UIImage>()
    private var failed = Set<String>()
    private var inflight: [String: Task<UIImage?, Never>] = [:]

    func cached(_ uri: String) -> UIImage? { cache.object(forKey: uri as NSString) }
    func hasFailed(_ uri: String) -> Bool { failed.contains(uri) }

    func load(_ uri: String) async -> UIImage? {
        if let c = cached(uri) { return c }
        if failed.contains(uri) { return nil }
        if let t = inflight[uri] { return await t.value }
        let t = Task<UIImage?, Never> {
            let data: Data?
            if uri.hasPrefix("data:") {
                // data:image/png;base64,....
                if let comma = uri.firstIndex(of: ",") {
                    data = Data(base64Encoded: String(uri[uri.index(after: comma)...]), options: .ignoreUnknownCharacters)
                } else {
                    data = nil
                }
            } else if let url = URL(string: uri) {
                data = try? await URLSession.shared.data(from: url).0
            } else {
                data = nil
            }
            guard let data, let img = UIImage(data: data) else { return nil }
            return img
        }
        inflight[uri] = t
        let img = await t.value
        inflight[uri] = nil
        // Only a bad data: URI is a permanent miss. A network failure is not remembered: RN's
        // <Image> retries on the next mount, so an offline cold start must not blank logos for good.
        if let img { cache.setObject(img, forKey: uri as NSString) } else if uri.hasPrefix("data:") { failed.insert(uri) }
        return img
    }
}

struct RemoteImage<Content: View>: View {
    let uri: String
    @ViewBuilder var content: (RemoteImagePhase) -> Content
    @State private var phase: RemoteImagePhase = .loading
    @State private var loadedFor: String?

    var body: some View {
        content(currentPhase)
            .task(id: uri) {
                if loadedFor == uri { return }
                let img = await RemoteImageCache.shared.load(uri)
                loadedFor = uri
                if let img {
                    phase = .success(Image(uiImage: img), pixelSize: CGSize(width: img.size.width * img.scale, height: img.size.height * img.scale))
                } else {
                    phase = .failure
                }
            }
    }

    private var currentPhase: RemoteImagePhase {
        if loadedFor == uri { return phase }
        if let img = RemoteImageCache.shared.cached(uri) {
            return .success(Image(uiImage: img), pixelSize: CGSize(width: img.size.width * img.scale, height: img.size.height * img.scale))
        }
        if RemoteImageCache.shared.hasFailed(uri) { return .failure }
        return .loading
    }
}
