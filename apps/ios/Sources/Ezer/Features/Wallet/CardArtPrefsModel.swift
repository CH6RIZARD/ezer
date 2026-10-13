// Port of apps/mobile/utils/cardArt/useCardArtPrefs.ts
//
// React hook over prefs.ts -> a small observable model: loads saved card looks for the cards on
// screen and exposes setters that update state and storage together.
//
//   @State private var artPrefs = CardArtPrefsModel()
//   .onChange(of: cardIds, initial: true) { artPrefs.load(cardIds) }   // useCardArtPrefs(cardIds)
//   artPrefs.prefs[cardId]
//
// The Wallet only reads prefs today (CardArtPicker, the UI that writes them, is not mounted).

import Foundation
import Observation

@Observable
@MainActor
final class CardArtPrefsModel {
    private(set) var prefs: [String: CardArtPrefs] = [:]

    /// A stable key so a new array with the same ids does not re-run the load.
    @ObservationIgnored private var idKey: String?

    /// The hook's load effect, keyed on `cardIds.join('|')`.
    func load(_ cardIds: [String]) {
        let key = cardIds.joined(separator: "|")
        if key == idKey { return }
        idKey = key
        let ids = key.isEmpty ? [] : key.components(separatedBy: "|")
        let loaded = loadCardArtPrefs(ids)
        // Merge rather than replace, so a choice made while this was loading is not clobbered by
        // the older stored value: `{ ...loaded, ...prev }`.
        prefs = loaded.merging(prefs) { _, prev in prev }
    }

    private func patch(_ cardId: String, _ change: (inout CardArtPrefs) -> Void) {
        var p = prefs[cardId] ?? CardArtPrefs()
        change(&p)
        prefs[cardId] = p
    }

    /** Pick a catalog design, or nil to go back to automatic. */
    func setDesign(_ cardId: String, _ designId: String?) async {
        patch(cardId) { $0.designId = designId }
        saveDesign(cardId, designId)
    }

    /** Opens the camera/library. Resolves to an error message, or nil on success/cancel. */
    func addPhoto(_ cardId: String, _ source: String) async -> String? {
        let result = await pickCardPhoto(source)
        switch result {
        case let .failure(reason):
            return photoErrorMessage(reason)
        case let .ok(uri):
            // RN: a throwing savePhoto -> 'Could not save that photo on this device.'
            // Foundation's savePhoto (UserDefaults) cannot throw, so that branch has no trigger.
            savePhoto(cardId, uri)
            patch(cardId) { $0.photoUri = uri }
            return nil
        }
    }

    func removePhoto(_ cardId: String) async {
        patch(cardId) { $0.photoUri = nil }
        savePhoto(cardId, nil)
    }
}
