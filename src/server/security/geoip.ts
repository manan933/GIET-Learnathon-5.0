export interface GeoLocation {
	city: string;
	country: string;
	lat: number;
	lon: number;
}

interface LoginTrack {
	ip: string;
	lat: number;
	lon: number;
	timestamp: number;
	city: string;
	country: string;
}

const userLoginHistory = new Map<string, LoginTrack>();

// Haversine formula to calculate distance in kilometers between two lat/lon coordinates
export function calculateDistanceKm(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number
): number {
	const R = 6371; // Earth's radius in km
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLon = ((lon2 - lon1) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos((lat1 * Math.PI) / 180) *
			Math.cos((lat2 * Math.PI) / 180) *
			Math.sin(dLon / 2) *
			Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

/**
 * Determine geolocation based on IP address and headers.
 */
export function resolveGeoLocation(ip: string): GeoLocation {
	if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
		return { city: 'Gunupur', country: 'India', lat: 19.0475, lon: 83.8183 };
	}

	// Pseudo-deterministic lookup for test IP addresses to enable reproducible testing
	const hash = ip.split('.').reduce((acc, octet) => acc + Number.parseInt(octet, 10) || 0, 0);
	if (hash % 3 === 0) {
		return { city: 'Bhubaneswar', country: 'India', lat: 20.2961, lon: 85.8245 };
	}
	if (hash % 3 === 1) {
		return { city: 'London', country: 'United Kingdom', lat: 51.5074, lon: -0.1278 };
	}
	return { city: 'Singapore', country: 'Singapore', lat: 1.3521, lon: 103.8198 };
}

/**
 * Checks if the new login represents physically impossible travel speed (> 900 km/h)
 */
export function checkImpossibleTravel(
	userId: string,
	ip: string
): { isAnomalous: boolean; speedKmh: number; prevLocation?: string; currentLocation: string } {
	const currentGeo = resolveGeoLocation(ip);
	const now = Date.now();
	const prev = userLoginHistory.get(userId);

	const currentLocation = `${currentGeo.city}, ${currentGeo.country}`;

	if (!prev) {
		userLoginHistory.set(userId, {
			ip,
			lat: currentGeo.lat,
			lon: currentGeo.lon,
			timestamp: now,
			city: currentGeo.city,
			country: currentGeo.country
		});
		return { isAnomalous: false, speedKmh: 0, currentLocation };
	}

	const hoursElapsed = (now - prev.timestamp) / (1000 * 60 * 60);
	const distanceKm = calculateDistanceKm(prev.lat, prev.lon, currentGeo.lat, currentGeo.lon);
	const speedKmh = hoursElapsed > 0.001 ? Math.round(distanceKm / hoursElapsed) : 0;

	const prevLocation = `${prev.city}, ${prev.country}`;

	// Update user's last known location
	userLoginHistory.set(userId, {
		ip,
		lat: currentGeo.lat,
		lon: currentGeo.lon,
		timestamp: now,
		city: currentGeo.city,
		country: currentGeo.country
	});

	// If distance is > 200 km and speed is > 900 km/h, flag as impossible travel
	const isAnomalous = distanceKm > 200 && speedKmh > 900;
	return { isAnomalous, speedKmh, prevLocation, currentLocation };
}
