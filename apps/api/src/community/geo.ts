import {
  communityPoint,
  type CommunityOrigin,
  type CommunityListing,
} from "@labelbridge/contracts";
export type Point = { latitude: number; longitude: number };
export function haversineMiles(a: Point, b: Point) {
  communityPoint.parse({ latitude: a.latitude, longitude: a.longitude });
  communityPoint.parse({ latitude: b.latitude, longitude: b.longitude });
  const rad = (x: number) => (x * Math.PI) / 180;
  const h =
    Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 2 * 3958.7613 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}
export function distanceFor(
  listing: CommunityListing,
  origin: CommunityOrigin | null,
  radius: number,
) {
  if (listing.locationMode === "online")
    return {
      section: "online" as const,
      distanceMiles: null,
      distanceApproximate: false,
    };
  if (
    !origin ||
    listing.latitude === null ||
    listing.longitude === null ||
    !listing.address ||
    !listing.geocodingMode ||
    listing.geocodingMode !== origin.dataMode
  )
    return {
      section: "distance_unverified" as const,
      distanceMiles: null,
      distanceApproximate: false,
    };
  const distance = haversineMiles(origin, {
    latitude: listing.latitude,
    longitude: listing.longitude,
  });
  if (distance > radius + 1e-9) return null;
  return {
    section: "nearby" as const,
    distanceMiles: Math.round(distance * 10) / 10,
    distanceApproximate: true,
  };
}
