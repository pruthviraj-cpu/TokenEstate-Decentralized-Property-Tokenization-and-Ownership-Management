import { useState, useEffect, useCallback } from 'react';
import type { Property, PropertyDocument, FraudCheckReport } from '../../types';
import { FRAUD_CHECKS } from '../mockData';
import { auditService } from './auditService';
import { APP_CONFIG } from '../../constants';
import { apiRequest } from '../api';
import useManualFetch from '../../hooks/useManualFetch';
import samplePropertyImage from '../../assets/images/property_bengaluru_estate_1790929235008.jpg';

export const DEFAULT_PROPERTY_IMAGE = samplePropertyImage;

export const PROPERTY_ENDPOINT = '/api/v1/properties';

export type RegisterPropertyData = Omit<
  Property,
  | 'id'
  | 'status'
  | 'registrationDate'
  | 'isTokenized'
  | 'governmentRegistrationRef'
>;

// ---------------------------------------------------------
// Shared Property State Store & Pub/Sub with Smart TTL Cache
// ---------------------------------------------------------
let sharedProperties: Property[] = [];
let lastPropertiesFetchTime = 0;
let lastPropertiesFetchErrorTime = 0;
let inFlightPropertiesPromise: Promise<Property[]> | null = null;

export const PROPERTIES_CACHE_TTL_MS = 60 * 1000; // 60 seconds
export const ERROR_RETRY_COOLDOWN_MS = 6 * 1000; // 6 seconds backoff cooldown

const listeners = new Set<() => void>();

export const subscribeProperties = (callback: () => void): (() => void) => {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
};

export const notifyProperties = (): void => {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.error('[notifyProperties] Subscriber error:', e);
    }
  });
};

export const getSharedProperties = (): Property[] => [...sharedProperties];

export const invalidatePropertiesCache = (): void => {
  lastPropertiesFetchTime = 0;
};

// READ CACHE UPDATE: Updates cache in-memory without notifying mutation subscribers
export const setCachedProperties = (props: Property[]): Property[] => {
  sharedProperties = props;
  lastPropertiesFetchTime = Date.now();
  lastPropertiesFetchErrorTime = 0;
  return sharedProperties;
};

// CACHE SINGLE PROPERTY: Updates or inserts a single item in cache without notifying mutation subscribers
export const cacheSingleProperty = (property: Property): Property => {
  const index = sharedProperties.findIndex((item) => item.id === property.id);
  if (index >= 0) {
    sharedProperties[index] = property;
  } else {
    sharedProperties = [property, ...sharedProperties];
  }
  return property;
};

// MUTATION STORE UPDATE: Updates store and notifies all subscribers (only used on real data mutations)
export const mutatePropertiesStore = (
  updater: (prev: Property[]) => Property[],
): Property[] => {
  sharedProperties = updater(sharedProperties);
  lastPropertiesFetchTime = Date.now();
  lastPropertiesFetchErrorTime = 0;
  notifyProperties();
  return sharedProperties;
};

// ---------------------------------------------------------
// Extraction & Mapping Helpers
// ---------------------------------------------------------
export const extractList = (response: any): any[] => {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.properties)) return response.properties;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.data)) return response.data;
  return [];
};

export const extractProperty = (response: any): any => {
  return response?.property ?? response?.data ?? response;
};

export const mapProperty = (value: any): Property => {
  const coordinates = value.coordinates ?? {};

  const statusMap: Record<string, Property['status']> = {
    pending: 'pending_verification',
    submitted: 'pending_verification',
    pending_verification: 'pending_verification',
    verified: 'verified',
    approved: 'verified',
    rejected: 'rejected',
    tokenized: 'tokenized',
  };

  const rawStatus = String(value.status ?? 'pending_verification')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  const status = statusMap[rawStatus] ?? 'pending_verification';

  const rawDocuments = value.documents ?? [];

  const documents: PropertyDocument[] = Array.isArray(rawDocuments)
    ? (rawDocuments.map((doc: any) => ({
        ...doc,
        ipfsCid: doc.ipfsCid ?? doc.ipfs_cid ?? doc.cid ?? '',
        verificationStatus:
          doc.verificationStatus ??
          doc.verification_status ??
          'pending',
        verifiedBy: doc.verifiedBy ?? doc.verified_by,
        verifiedAt: doc.verifiedAt ?? doc.verified_at,
      })) as PropertyDocument[])
    : [];

  return {
    ...value,
    id: String(
      value.id ?? value.property_id ?? value.propertyId ?? '',
    ),
    title: value.title ?? value.name ?? '',
    surveyNumber: String(
      value.surveyNumber ?? value.survey_number ?? '',
    ),
    propertyType: value.propertyType ?? value.property_type ?? '',
    address: value.address ?? '',
    city: value.city ?? '',
    state: value.state ?? '',
    district: value.district ?? '',
    pinCode: String(
      value.pinCode ?? value.pin_code ?? value.pincode ?? '',
    ),
    areaSqFt: Number(
      value.areaSqFt ??
        value.area_sq_ft ??
        value.area_sqft ??
        value.area ??
        0,
    ),
    landType: value.landType ?? value.land_type ?? '',
    coordinates: {
      lat: Number(
        coordinates.lat ??
          coordinates.latitude ??
          value.latitude ??
          0,
      ),
      lng: Number(
        coordinates.lng ??
          coordinates.longitude ??
          value.longitude ??
          0,
      ),
    },
    currentOwnerAddress:
      value.currentOwnerAddress ??
      value.current_owner_address ??
      value.owner_wallet ??
      value.owner_address ??
      '',
    ownershipType: value.ownershipType ?? value.ownership_type ?? '',
    registrationDate:
      value.registrationDate ??
      value.registration_date ??
      value.created_at ??
      '',
    status,
    governmentRegistrationRef:
      value.governmentRegistrationRef ??
      value.government_registration_ref ??
      '',
    valuationInINR: Number(
      value.valuationInINR ??
        value.valuation_in_inr ??
        value.valuation_inr ??
        0,
    ),
    valuationInMATIC: Number(
      value.valuationInMATIC ??
        value.valuation_in_matic ??
        0,
    ),
    isTokenized: Boolean(
      value.isTokenized ??
        value.is_tokenized ??
        status === 'tokenized',
    ),
    tokenId: value.tokenId ?? value.token_id,
    tokenContract: value.tokenContract ?? value.token_contract,
    mintTxHash: value.mintTxHash ?? value.mint_tx_hash,
    image: value.image || value.image_url || samplePropertyImage,
    documents,
  } as Property;
};

// ---------------------------------------------------------
// PropertyService Class (Single Source of Truth)
// ---------------------------------------------------------
export class PropertyService {
  public subscribe(callback: () => void): () => void {
    return subscribeProperties(callback);
  }

  public getSharedProperties(): Property[] {
    return getSharedProperties();
  }

  public invalidateCache(): void {
    invalidatePropertiesCache();
  }

  public extractList(response: any): any[] {
    return extractList(response);
  }

  public extractProperty(response: any): any {
    return extractProperty(response);
  }

  public mapProperty(value: any): Property {
    return mapProperty(value);
  }

  public async getAllProperties(forceRefresh = false): Promise<Property[]> {
    const isCacheFresh =
      lastPropertiesFetchTime > 0 &&
      Date.now() - lastPropertiesFetchTime < PROPERTIES_CACHE_TTL_MS;

    // Cache hit: immediately return cached copy with zero network overhead
    if (!forceRefresh && isCacheFresh) {
      return [...sharedProperties];
    }

    // Cooldown check: prevent tight loops on persistent backend failures
    if (
      !forceRefresh &&
      lastPropertiesFetchErrorTime > 0 &&
      Date.now() - lastPropertiesFetchErrorTime < ERROR_RETRY_COOLDOWN_MS
    ) {
      return [...sharedProperties];
    }

    // In-flight deduplication: return the shared active promise to collapse concurrent requests
    if (inFlightPropertiesPromise) {
      return inFlightPropertiesPromise;
    }

    inFlightPropertiesPromise = (async () => {
      try {
        const response = await apiRequest<any>({
          endpoint: PROPERTY_ENDPOINT,
          method: 'GET',
        });

        const mapped = extractList(response).map(mapProperty);
        setCachedProperties(mapped);
        return [...sharedProperties];
      } catch (err) {
        lastPropertiesFetchErrorTime = Date.now();
        console.warn('[PropertyService] getAllProperties fetch failed:', err);
        if (sharedProperties.length > 0) {
          return [...sharedProperties];
        }
        throw err;
      } finally {
        inFlightPropertiesPromise = null;
      }
    })();

    return inFlightPropertiesPromise;
  }

  public async getPropertyById(id: string): Promise<Property | null> {
    const cached = sharedProperties.find((item) => item.id === id);
    const isCacheFresh =
      lastPropertiesFetchTime > 0 &&
      Date.now() - lastPropertiesFetchTime < PROPERTIES_CACHE_TTL_MS;

    if (cached && isCacheFresh) {
      return cached;
    }

    try {
      const response = await apiRequest<any>({
        endpoint: `${PROPERTY_ENDPOINT}/${encodeURIComponent(id)}`,
        method: 'GET',
      });

      const property = mapProperty(extractProperty(response));
      cacheSingleProperty(property);
      return property;
    } catch (err) {
      if (cached) return cached;
      throw err;
    }
  }

  public async getPropertiesByOwner(
    ownerAddress: string,
  ): Promise<Property[]> {
    const properties = await this.getAllProperties();
    return properties.filter(
      (property) =>
        property.currentOwnerAddress.toLowerCase() ===
        ownerAddress.toLowerCase(),
    );
  }

  public async getPendingProperties(): Promise<Property[]> {
    const properties = await this.getAllProperties();
    return properties.filter(
      (property) => property.status === 'pending_verification',
    );
  }

  public async getMarketplaceProperties(): Promise<Property[]> {
    const properties = await this.getAllProperties();
    return properties.filter(
      (property) =>
        property.status === 'verified' ||
        property.status === 'tokenized',
    );
  }

  public async registerProperty(
    data: RegisterPropertyData,
  ): Promise<{
    property: Property;
    txHash: string;
    blockNumber: number;
  }> {
    const payload = {
      title: data.title,
      survey_number: data.surveyNumber,
      property_type: data.propertyType,
      address: data.address,
      city: data.city,
      state: data.state,
      district: data.district,
      pin_code: data.pinCode,
      area_sq_ft: data.areaSqFt,
      land_type: data.landType,
      latitude: data.coordinates?.lat,
      longitude: data.coordinates?.lng,
      current_owner_address: data.currentOwnerAddress,
      ownership_type: data.ownershipType,
      valuation_in_inr: data.valuationInINR,
      valuation_in_matic: data.valuationInMATIC,
    };

    const response = await apiRequest<any>({
      endpoint: PROPERTY_ENDPOINT,
      method: 'POST',
      body: payload,
    });

    const result = extractProperty(response);
    const property = mapProperty(result);

    const txHash = String(
      response?.tx_hash ??
        response?.txHash ??
        result?.tx_hash ??
        result?.txHash ??
        '',
    );

    const blockNumber = Number(
      response?.block_number ??
        response?.blockNumber ??
        result?.block_number ??
        result?.blockNumber ??
        0,
    );

    mutatePropertiesStore((prev) => [
      property,
      ...prev.filter((item) => item.id !== property.id),
    ]);

    if (txHash) {
      auditService.recordEvent({
        propertyId: property.id,
        eventType: 'PropertyRegistered',
        actorAddress: property.currentOwnerAddress,
        role: 'Owner',
        blockNumber,
        txHash,
        details: `Property registration submitted for Survey ${property.surveyNumber} in ${property.city}.`,
      });
    }

    return { property, txHash, blockNumber };
  }

  public async approveProperty(
    id: string,
    officerAddress: string,
    notes?: string,
  ): Promise<{ success: boolean; txHash: string }> {
    const response = await apiRequest<any>({
      endpoint: `${PROPERTY_ENDPOINT}/${encodeURIComponent(id)}/approve`,
      method: 'POST',
      body: {
        officer_address: officerAddress,
        notes,
      },
    });

    const txHash = response?.tx_hash ?? response?.txHash ?? '';

    mutatePropertiesStore((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: 'verified' as const } : item,
      ),
    );

    auditService.recordEvent({
      propertyId: id,
      eventType: 'PropertyApproved',
      actorAddress: officerAddress,
      role: 'Government Registrar',
      blockNumber: Number(response?.block_number ?? 0),
      txHash: String(txHash),
      details: `Property title confirmed and approved for tokenization. Notes: ${notes || 'Verified against revenue records'}`,
    });

    return {
      success: response?.success ?? true,
      txHash: String(txHash),
    };
  }

  public async rejectProperty(
    id: string,
    officerAddress: string,
    reason: string,
  ): Promise<{ success: boolean; txHash: string }> {
    const response = await apiRequest<any>({
      endpoint: `${PROPERTY_ENDPOINT}/${encodeURIComponent(id)}/reject`,
      method: 'POST',
      body: {
        officer_address: officerAddress,
        reason,
      },
    });

    const txHash = response?.tx_hash ?? response?.txHash ?? '';

    mutatePropertiesStore((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: 'rejected' as const } : item,
      ),
    );

    auditService.recordEvent({
      propertyId: id,
      eventType: 'PropertyRejected',
      actorAddress: officerAddress,
      role: 'Government Registrar',
      blockNumber: Number(response?.block_number ?? 0),
      txHash: String(txHash),
      details: `Property registration rejected: ${reason}`,
    });

    return {
      success: response?.success ?? true,
      txHash: String(txHash),
    };
  }

  public async attachDocument(
    propertyId: string,
    doc: PropertyDocument,
  ): Promise<void> {
    await apiRequest<any>({
      endpoint: `${PROPERTY_ENDPOINT}/${encodeURIComponent(propertyId)}/documents`,
      method: 'POST',
      body: {
        ...doc,
        ipfs_cid: doc.ipfsCid,
      },
    });

    mutatePropertiesStore((prev) =>
      prev.map((item) =>
        item.id === propertyId
          ? { ...item, documents: [...(item.documents || []), doc] }
          : item,
      ),
    );

    auditService.recordEvent({
      propertyId,
      eventType: 'DocumentAdded',
      actorAddress: doc.verifiedBy || '0x0000000000000000000000000000000000000000',
      role: 'Owner',
      blockNumber: 0,
      txHash: '',
      details: `Instrument ${doc.name} (${doc.type}) attached with IPFS CID ${doc.ipfsCid}`,
    });
  }

  public async tokenizeProperty(
    propertyId: string,
    ownerAddress: string,
  ): Promise<{
    tokenId: string;
    txHash: string;
    contractAddress: string;
  }> {
    const response = await apiRequest<any>({
      endpoint: `${PROPERTY_ENDPOINT}/${encodeURIComponent(propertyId)}/tokenize`,
      method: 'POST',
      body: {
        owner_address: ownerAddress,
      },
    });

    const tokenId = String(
      response?.token_id ?? response?.tokenId ?? '',
    );

    const txHash = String(
      response?.tx_hash ?? response?.txHash ?? '',
    );

    const contractAddress = String(
      response?.contract_address ??
        response?.contractAddress ??
        APP_CONFIG.contracts.propertyNFT,
    );

    if (!tokenId || !txHash) {
      throw new Error(
        'The backend did not return a token ID and transaction hash.',
      );
    }

    mutatePropertiesStore((prev) =>
      prev.map((item) =>
        item.id === propertyId
          ? {
              ...item,
              status: 'tokenized' as const,
              isTokenized: true,
              tokenId,
              tokenContract: contractAddress,
              mintTxHash: txHash,
            }
          : item,
      ),
    );

    auditService.recordEvent({
      propertyId,
      eventType: 'NFTMinted',
      actorAddress: ownerAddress,
      role: 'Owner',
      blockNumber: Number(response?.block_number ?? 0),
      txHash,
      details: `ERC-721 Token #${tokenId} minted to ${ownerAddress} on contract ${contractAddress}`,
    });

    return { tokenId, txHash, contractAddress };
  }

  public async transferOwnership(
    propertyId: string,
    newOwnerAddress: string,
    transferTxHash: string,
  ): Promise<void> {
    await apiRequest<any>({
      endpoint: `${PROPERTY_ENDPOINT}/${encodeURIComponent(propertyId)}/transfer`,
      method: 'POST',
      body: {
        new_owner_address: newOwnerAddress,
        transaction_hash: transferTxHash,
      },
    });

    mutatePropertiesStore((prev) =>
      prev.map((item) =>
        item.id === propertyId
          ? { ...item, currentOwnerAddress: newOwnerAddress }
          : item,
      ),
    );

    auditService.recordEvent({
      propertyId,
      eventType: 'TransferCompleted',
      actorAddress: newOwnerAddress,
      role: 'Buyer',
      blockNumber: 0,
      txHash: transferTxHash,
      details: `Title conveyed to ${newOwnerAddress}. TxHash: ${transferTxHash}`,
    });
  }

  public getFraudReport(propertyId: string): FraudCheckReport {
    if (FRAUD_CHECKS[propertyId]) {
      return FRAUD_CHECKS[propertyId];
    }

    const property = sharedProperties.find((p) => p.id === propertyId);

    return {
      propertyId,
      surveyNumber: property?.surveyNumber ?? 'N/A',
      isUniquePropertyId: true,
      isUniqueSurveyNumber: true,
      ownerWalletValid: Boolean(property?.currentOwnerAddress),
      documentsVerified:
        property?.status === 'verified' ||
        property?.status === 'tokenized',
      previousOwnershipClean: true,
      nftUnique: true,
      conflictDetected: false,
      lastAudited: new Date().toISOString(),
    };
  }
}

export const propertyService = new PropertyService();

// ---------------------------------------------------------
// Custom React Hook: usePropertyService
// ---------------------------------------------------------
export function usePropertyService() {
  const { execute, executeBlob } = useManualFetch<any>();

  const [properties, setProperties] = useState<Property[]>(
    () => sharedProperties,
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Synchronize local hook state whenever a real mutation occurs
    const unsubscribe = subscribeProperties(() => {
      setProperties([...sharedProperties]);
    });
    return unsubscribe;
  }, []);

  const getAllProperties = useCallback(
    async (forceRefresh = false): Promise<Property[]> => {
      const isCacheFresh =
        lastPropertiesFetchTime > 0 &&
        Date.now() - lastPropertiesFetchTime < PROPERTIES_CACHE_TTL_MS;

      // Cache hit: instant return without triggering loading state toggles
      if (!forceRefresh && isCacheFresh) {
        setProperties([...sharedProperties]);
        return [...sharedProperties];
      }

      setLoading(true);
      setError(null);
      try {
        const data = await propertyService.getAllProperties(forceRefresh);
        setProperties(data);
        return data;
      } catch (err: any) {
        const msg = err?.message || 'Failed to fetch properties';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const getPropertyById = useCallback(
    async (id: string): Promise<Property | null> => {
      return propertyService.getPropertyById(id);
    },
    [],
  );

  const getPropertiesByOwner = useCallback(
    async (ownerAddress: string): Promise<Property[]> => {
      return propertyService.getPropertiesByOwner(ownerAddress);
    },
    [],
  );

  const getPendingProperties = useCallback(async (): Promise<Property[]> => {
    return propertyService.getPendingProperties();
  }, []);

  const getMarketplaceProperties = useCallback(async (): Promise<Property[]> => {
    return propertyService.getMarketplaceProperties();
  }, []);

  const registerProperty = useCallback(
    async (data: RegisterPropertyData) => {
      setLoading(true);
      setError(null);
      try {
        const res = await propertyService.registerProperty(data);
        setProperties([...sharedProperties]);
        return res;
      } catch (err: any) {
        const msg = err?.message || 'Registration failed';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const approveProperty = useCallback(
    async (id: string, officerAddress: string, notes?: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await propertyService.approveProperty(id, officerAddress, notes);
        setProperties([...sharedProperties]);
        return res;
      } catch (err: any) {
        const msg = err?.message || 'Approval failed';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const rejectProperty = useCallback(
    async (id: string, officerAddress: string, reason: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await propertyService.rejectProperty(id, officerAddress, reason);
        setProperties([...sharedProperties]);
        return res;
      } catch (err: any) {
        const msg = err?.message || 'Rejection failed';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const attachDocument = useCallback(
    async (propertyId: string, doc: PropertyDocument) => {
      setLoading(true);
      setError(null);
      try {
        await propertyService.attachDocument(propertyId, doc);
        setProperties([...sharedProperties]);
      } catch (err: any) {
        const msg = err?.message || 'Attach document failed';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const tokenizeProperty = useCallback(
    async (propertyId: string, ownerAddress: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await propertyService.tokenizeProperty(propertyId, ownerAddress);
        setProperties([...sharedProperties]);
        return res;
      } catch (err: any) {
        const msg = err?.message || 'Tokenization failed';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const transferOwnership = useCallback(
    async (propertyId: string, newOwnerAddress: string, transferTxHash: string) => {
      setLoading(true);
      setError(null);
      try {
        await propertyService.transferOwnership(propertyId, newOwnerAddress, transferTxHash);
        setProperties([...sharedProperties]);
      } catch (err: any) {
        const msg = err?.message || 'Transfer failed';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const getFraudReport = useCallback((propertyId: string): FraudCheckReport => {
    return propertyService.getFraudReport(propertyId);
  }, []);

  return {
    properties,
    status: loading ? 'loading' : error ? 'error' : 'idle',
    loading,
    error,
    data: properties,
    execute,
    executeBlob,
    subscribe: subscribeProperties,
    getSharedProperties,
    invalidateCache: invalidatePropertiesCache,
    mapProperty,
    extractList,
    extractProperty,
    getAllProperties,
    getPropertyById,
    getPropertiesByOwner,
    getPendingProperties,
    getMarketplaceProperties,
    registerProperty,
    approveProperty,
    rejectProperty,
    attachDocument,
    tokenizeProperty,
    transferOwnership,
    getFraudReport,
  };
}
