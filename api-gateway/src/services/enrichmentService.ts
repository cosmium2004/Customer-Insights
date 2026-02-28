/**
 * Data Enrichment Service
 * 
 * Enriches customer interaction data with additional context:
 * - Organization context
 * - Customer segment information
 * - Normalized device information
 * - Geolocation data
 * 
 * Requirements: 12.1, 12.2, 12.3, 12.4
 */

import { InteractionData } from './validationService';
import { getDbConnection } from '../config/database';

export interface EnrichedInteraction extends InteractionData {
  organizationId: string;
  customerSegment?: string;
  deviceInfo?: {
    type?: string;
    os?: string;
    browser?: string;
    version?: string;
  };
  geolocation?: {
    country?: string;
    region?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
  };
}

/**
 * Normalizes device information from metadata
 * Extracts and standardizes device type, OS, browser, and version
 */
function normalizeDeviceInfo(metadata: Record<string, any>): EnrichedInteraction['deviceInfo'] | undefined {
  if (!metadata) return undefined;

  const deviceInfo: EnrichedInteraction['deviceInfo'] = {};

  // Extract device type
  if (metadata.device || metadata.deviceType) {
    deviceInfo.type = String(metadata.device || metadata.deviceType).toLowerCase();
  }

  // Extract OS information
  if (metadata.os || metadata.operatingSystem) {
    deviceInfo.os = String(metadata.os || metadata.operatingSystem);
  }

  // Extract browser information
  if (metadata.browser || metadata.userAgent) {
    deviceInfo.browser = String(metadata.browser || metadata.userAgent);
  }

  // Extract version
  if (metadata.version || metadata.browserVersion) {
    deviceInfo.version = String(metadata.version || metadata.browserVersion);
  }

  // Return undefined if no device info was found
  return Object.keys(deviceInfo).length > 0 ? deviceInfo : undefined;
}

/**
 * Extracts geolocation data from metadata
 * Supports various geolocation field formats
 */
function extractGeolocation(metadata: Record<string, any>): EnrichedInteraction['geolocation'] | undefined {
  if (!metadata) return undefined;

  const geolocation: EnrichedInteraction['geolocation'] = {};

  // Check for nested geolocation object
  const geoData = metadata.geolocation || metadata.geo || metadata.location;
  
  if (geoData && typeof geoData === 'object') {
    if (geoData.country) geolocation.country = String(geoData.country);
    if (geoData.region || geoData.state) geolocation.region = String(geoData.region || geoData.state);
    if (geoData.city) geolocation.city = String(geoData.city);
    if (geoData.latitude !== undefined || geoData.lat !== undefined) {
      const lat = geoData.latitude !== undefined ? geoData.latitude : geoData.lat;
      geolocation.latitude = typeof lat === 'number' ? lat : parseFloat(String(lat));
    }
    if (geoData.longitude !== undefined || geoData.lng !== undefined || geoData.lon !== undefined) {
      const lng = geoData.longitude !== undefined ? geoData.longitude : (geoData.lng !== undefined ? geoData.lng : geoData.lon);
      geolocation.longitude = typeof lng === 'number' ? lng : parseFloat(String(lng));
    }
  } else {
    // Check for flat structure
    if (metadata.country) geolocation.country = String(metadata.country);
    if (metadata.region || metadata.state) geolocation.region = String(metadata.region || metadata.state);
    if (metadata.city) geolocation.city = String(metadata.city);
    if (metadata.latitude !== undefined || metadata.lat !== undefined) {
      const lat = metadata.latitude !== undefined ? metadata.latitude : metadata.lat;
      geolocation.latitude = typeof lat === 'number' ? lat : parseFloat(String(lat));
    }
    if (metadata.longitude !== undefined || metadata.lng !== undefined || metadata.lon !== undefined) {
      const lng = metadata.longitude !== undefined ? metadata.longitude : (metadata.lng !== undefined ? metadata.lng : metadata.lon);
      geolocation.longitude = typeof lng === 'number' ? lng : parseFloat(String(lng));
    }
  }

  // Return undefined if no geolocation data was found
  return Object.keys(geolocation).length > 0 ? geolocation : undefined;
}

/**
 * Enriches interaction data with organization context and customer information
 * 
 * @param data - Validated interaction data
 * @returns EnrichedInteraction with additional context
 * 
 * Enrichment steps:
 * 1. Query database for customer record to get organizationId
 * 2. Add customer segment information if available
 * 3. Normalize device information from metadata
 * 4. Extract geolocation data from metadata if available
 */
export async function enrichInteraction(data: InteractionData): Promise<EnrichedInteraction> {
  const db = getDbConnection();
  
  // Query customer record to get organization context and segment
  const customer = await db('customers')
    .select('organization_id', 'segment')
    .where({ id: data.customerId })
    .first();

  if (!customer) {
    throw new Error(`Customer not found: ${data.customerId}`);
  }

  // Build enriched interaction
  const enriched: EnrichedInteraction = {
    ...data,
    organizationId: customer.organization_id
  };

  // Add customer segment if available
  if (customer.segment) {
    enriched.customerSegment = customer.segment;
  }

  // Normalize device information from metadata
  if (data.metadata) {
    const deviceInfo = normalizeDeviceInfo(data.metadata);
    if (deviceInfo) {
      enriched.deviceInfo = deviceInfo;
    }

    // Extract geolocation data
    const geolocation = extractGeolocation(data.metadata);
    if (geolocation) {
      enriched.geolocation = geolocation;
    }
  }

  return enriched;
}
