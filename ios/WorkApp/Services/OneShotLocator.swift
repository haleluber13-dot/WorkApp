import Foundation
import CoreLocation

/// Grabs the device's position once, for stamping a location while standing
/// on it. Deliberately one-shot: continuous tracking would be a battery cost
/// and a privacy cost for no benefit here.
@MainActor
final class OneShotLocator: NSObject, ObservableObject, CLLocationManagerDelegate {

    @Published var coordinate: CLLocationCoordinate2D?
    @Published var isWorking = false
    @Published var errorMessage: String?

    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    func request() {
        errorMessage = nil
        isWorking = true
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()   // resumes in the delegate
        case .restricted, .denied:
            isWorking = false
            errorMessage = "הגישה למיקום חסומה בהגדרות"
        default:
            manager.requestLocation()
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            guard isWorking else { return }
            switch manager.authorizationStatus {
            case .authorizedWhenInUse, .authorizedAlways:
                manager.requestLocation()
            case .denied, .restricted:
                isWorking = false
                errorMessage = "הגישה למיקום חסומה בהגדרות"
            default:
                break
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager,
                                     didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        Task { @MainActor in
            // Six decimals is ~0.1 m — more than enough, and keeps the record tidy.
            coordinate = CLLocationCoordinate2D(
                latitude:  (loc.coordinate.latitude  * 1_000_000).rounded() / 1_000_000,
                longitude: (loc.coordinate.longitude * 1_000_000).rounded() / 1_000_000)
            isWorking = false
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager,
                                     didFailWithError error: Error) {
        Task { @MainActor in
            isWorking = false
            errorMessage = "לא הצלחנו לקבל מיקום"
        }
    }
}
