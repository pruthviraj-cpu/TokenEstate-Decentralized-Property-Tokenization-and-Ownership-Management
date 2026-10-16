import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { FileUpload, type UploadedFileInfo } from '../../components/ui/FileUpload';
import { HashDisplay } from '../../components/ui/HashDisplay';
import {
  documentService,
  type VerificationResult,
  type EngineStatusResponse,
  type AuditStats,
} from '../../services/blockchain/documentService';
import { usePropertyService } from '../../services/blockchain/propertyService';
import { IPFSService } from '../../services/ipfs/ipfsService';
import {
  CheckCircle2,
  AlertTriangle,
  FileText,
  Search,
  ShieldCheck,
  ExternalLink,
  Cpu,
  RotateCcw,
  Activity,
  Layers,
  ArrowRight,
  ShieldAlert,
  HelpCircle,
  FileSearch,
} from 'lucide-react';

export const DocumentVerificationPage: React.FC = () => {
  const { getAllProperties } = usePropertyService();

  const [queryInput, setQueryInput] = useState('');
  const [onchainHashInput, setOnchainHashInput] = useState('');
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [properties, setProperties] = useState<any[]>([]);

  const [result, setResult] = useState<VerificationResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [searched, setSearched] = useState(false);

  // Engine status & Audit stats
  const [engineStatus, setEngineStatus] = useState<EngineStatusResponse | null>(null);
  const [auditStats, setAuditStats] = useState<AuditStats>(() => documentService.getAuditStats());

  useEffect(() => {
    // 1. Fetch available properties for dropdown
    getAllProperties().then(data => setProperties(data)).catch(() => {});

    // 2. Fetch backend engine diagnostic status
    documentService.getEngineStatus().then(status => {
      if (status) setEngineStatus(status);
    });
  }, []);

  const handlePropertySelect = (propertyId: string) => {
    setSelectedPropertyId(propertyId);
    if (!propertyId) {
      setOnchainHashInput('');
      return;
    }
    const prop = properties.find(p => p.id === propertyId);
    if (prop) {
      const bestHash =
        prop.metadata_hash ||
        prop.blockchain_property_id ||
        (prop.documents && prop.documents[0]?.sha256Hash) ||
        '';
      setOnchainHashInput(bestHash);
    }
  };

  const handleFileUploaded = async (info: UploadedFileInfo) => {
    setIsChecking(true);
    setSearched(true);
    try {
      const res = await documentService.verifyDocument(
        info.file,
        onchainHashInput.trim() || undefined,
        selectedPropertyId || undefined,
      );
      setResult(res);
      setAuditStats(documentService.getAuditStats());
    } catch (e: any) {
      console.error('[DocumentVerificationPage] Verification failed:', e);
      setResult({
        matches: false,
        computedHash: info.sha256Hash,
        expectedHash: onchainHashInput.trim() || '0x0000000000000000000000000000000000000000',
        verifiedAt: new Date().toISOString(),
        discrepancyNote:
          e?.message || 'Error occurred while contacting the zero-trust tamper verification engine.',
        overallStatus: 'TAMPERED_LOSS',
        verdict: 'VERIFICATION_ERROR: Tamper checking engine unreachable.',
        summary: {
          totalChecks: 3,
          successCount: 0,
          lossCount: 3,
          passPercentage: 0,
        },
      });
      setAuditStats(documentService.getAuditStats());
    } finally {
      setIsChecking(false);
    }
  };

  const handleQuerySearch = async () => {
    if (!queryInput.trim()) return;
    setIsChecking(true);
    setSearched(true);
    try {
      const res = await documentService.verifyByCidOrHash(queryInput.trim());
      if (res) {
        setResult(res);
      } else {
        setResult({
          matches: false,
          computedHash: queryInput.trim(),
          expectedHash: queryInput.trim(),
          verifiedAt: new Date().toISOString(),
          discrepancyNote:
            'Integrity Discrepancy (Loss): No matching deed hash, metadata digest, or IPFS CID was found on the Polygon ledger.',
          overallStatus: 'NOT_FOUND',
          verdict: 'NO RECORD FOUND: The supplied hash does not correspond to any registered cadastral deed.',
          summary: {
            totalChecks: 3,
            successCount: 0,
            lossCount: 3,
            passPercentage: 0,
          },
        });
      }
      setAuditStats(documentService.getAuditStats());
    } catch (e) {
      console.error(e);
    } finally {
      setIsChecking(false);
    }
  };

  const handleResetStats = () => {
    const fresh = documentService.resetAuditStats();
    setAuditStats(fresh);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <FileSearch className="w-5 h-5 text-blue-500" />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Cryptographic Deed Verification & Tamper Check
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Zero-Trust public forensics powered by PyMuPDF, RapidOCR (ONNX), Polygon smart contracts, and IPFS immutability.
          </p>
        </div>

        {/* Engine Diagnostic Badge */}
        {engineStatus && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>4 Forensic Layers Operational · Pinata Gateway Active</span>
          </div>
        )}
      </div>

      {/* Cumulative Audit Statistics (Checks Success vs Loss Counter) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Total Audited
            </span>
            <span className="text-2xl font-black text-slate-900">{auditStats.totalChecked}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Documents evaluated</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider block">
              Checks Succeeded
            </span>
            <span className="text-2xl font-black text-emerald-800">{auditStats.totalSuccess}</span>
            <span className="text-[10px] text-emerald-600 font-medium block mt-0.5">Authentic & Verified</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-red-200 bg-red-50/20 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-red-700 uppercase tracking-wider block">
              Checks Loss / Failed
            </span>
            <span className="text-2xl font-black text-red-800">{auditStats.totalLoss}</span>
            <span className="text-[10px] text-red-600 font-medium block mt-0.5">Tampered / Discrepancy</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-700">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-blue-200 bg-blue-50/20 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider block">
              Pass Rate
            </span>
            <span className="text-2xl font-black text-blue-900">{auditStats.passRate}%</span>
            <button
              onClick={handleResetStats}
              className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 mt-0.5 transition-colors"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              Reset Stats
            </button>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Verification Card */}
      <Card>
        <CardHeader
          title="Zero-Trust Document Tamper & Hash Verification"
          subtitle="Compare a physical or digital PDF land deed against the immutable on-chain Polygon ledger using dual Keccak-256 binary and RapidOCR text extraction."
        />
        <CardContent className="space-y-6">
          {/* Target On-Chain Hash Configuration */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-blue-600" />
                Select On-Chain Polygon Anchor to Cross-Verify Against:
              </span>
              <span className="text-[11px] text-slate-500">Optional · Defaults to auto-matching against ledger</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option 1: Pick from registered parcels */}
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  1. Link to Registered Cadastral Parcel:
                </label>
                <select
                  value={selectedPropertyId}
                  onChange={e => handlePropertySelect(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Choose Parcel from Ledger (Auto-fill on-chain hash) --</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.title} · {p.city} ({p.surveyNumber})
                    </option>
                  ))}
                </select>
              </div>

              {/* Option 2: Custom On-Chain Hash */}
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  2. Or Custom On-Chain Polygon Hash:
                </label>
                <Input
                  placeholder="0x... (Keccak-256 / SHA-256 Hash)"
                  value={onchainHashInput}
                  onChange={e => setOnchainHashInput(e.target.value)}
                  className="text-xs font-mono"
                />
              </div>
            </div>

            {/* Quick Test Chips */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[10px] font-semibold uppercase text-slate-400">Quick Test Anchors:</span>
              <button
                type="button"
                onClick={() => setOnchainHashInput('0xf6af6b4df153b73860a098d6f3558c3af986350383ce52ae104eafb0f2f975e8')}
                className="text-[11px] px-2.5 py-1 rounded-md bg-blue-100 hover:bg-blue-200 text-blue-800 font-mono transition-colors"
              >
                Genuine Digital Deed Hash (0xf6af...5e8)
              </button>
              <button
                type="button"
                onClick={() => setOnchainHashInput('0x0000000000000000000000000000000000000000000000000000000000000000')}
                className="text-[11px] px-2.5 py-1 rounded-md bg-slate-200 hover:bg-slate-300 text-slate-700 font-mono transition-colors"
              >
                Test Altered / Mismatch Hash (0x000...000)
              </button>
              {onchainHashInput && (
                <button
                  type="button"
                  onClick={() => { setOnchainHashInput(''); setSelectedPropertyId(''); }}
                  className="text-[11px] text-slate-500 hover:text-slate-800 underline underline-offset-2 ml-auto"
                >
                  Clear Anchor
                </button>
              )}
            </div>
          </div>

          {/* File Upload Box */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-700 block">
              Step 2: Upload Real Estate PDF Document (Deed, Mutation 7/12, Survey Map)
            </span>
            <FileUpload
              label=""
              onFileProcessed={handleFileUploaded}
            />
          </div>

          {/* Divider */}
          <div className="relative flex items-center justify-center my-6">
            <div className="border-t border-slate-200 w-full" />
            <span className="bg-white px-3 text-xs text-slate-400 uppercase tracking-wider font-semibold">
              Or Verify Directly by IPFS CID or Cryptographic Hash
            </span>
          </div>

          {/* Direct Search Bar */}
          <div className="flex gap-2">
            <Input
              placeholder="Paste IPFS CID (bafy...) or SHA-256 / Keccak-256 Hash (0x...)"
              value={queryInput}
              onChange={e => setQueryInput(e.target.value)}
              className="flex-1 font-mono text-xs"
            />
            <Button
              variant="primary"
              size="md"
              onClick={handleQuerySearch}
              isLoading={isChecking}
              disabled={isChecking || !queryInput.trim()}
              leftIcon={<Search className="w-4 h-4" />}
            >
              Verify Ledger Record
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Verification Result Scorecard (Success vs Loss Details) */}
      {searched && result && (
        <Card className={`border-2 shadow-md transition-all ${
          result.overallStatus === 'AUTHENTIC'
            ? 'border-emerald-400 bg-emerald-50/10'
            : result.overallStatus === 'CONTENT_ONLY'
            ? 'border-amber-400 bg-amber-50/10'
            : 'border-red-400 bg-red-50/10'
        }`}>
          <CardHeader
            title={
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
                <div className="flex items-center gap-2.5">
                  {result.overallStatus === 'AUTHENTIC' ? (
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                  ) : result.overallStatus === 'CONTENT_ONLY' ? (
                    <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center text-red-700">
                      <ShieldAlert className="w-6 h-6" />
                    </div>
                  )}

                  <div>
                    <h3 className={`text-base font-bold ${
                      result.overallStatus === 'AUTHENTIC'
                        ? 'text-emerald-950'
                        : result.overallStatus === 'CONTENT_ONLY'
                        ? 'text-amber-950'
                        : 'text-red-950'
                    }`}>
                      {result.overallStatus === 'AUTHENTIC'
                        ? '100% Cryptographic Integrity Confirmed'
                        : result.overallStatus === 'CONTENT_ONLY'
                        ? 'Legal Content Verified (Modified Compression / Metadata)'
                        : 'Integrity Failure / Tampered Document Detected (Loss)'}
                    </h3>
                    <p className="text-xs text-slate-500">{result.verdict}</p>
                  </div>
                </div>

                {/* Success vs Loss Metric Pill */}
                {result.summary && (
                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      ✓ {result.summary.successCount} Succeeded
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                      result.summary.lossCount > 0
                        ? 'bg-red-100 text-red-800 border-red-300'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      ✗ {result.summary.lossCount} Loss
                    </span>
                  </div>
                )}
              </div>
            }
          />
          <CardContent className="space-y-6">
            {/* Pass Rate Progress Bar */}
            {result.summary && (
              <div className="space-y-1.5 p-4 rounded-xl bg-white border border-slate-200">
                <div className="flex justify-between text-xs font-semibold text-slate-700">
                  <span>Diagnostic Pass Score</span>
                  <span>{result.summary.passPercentage}% Integrity Confidence ({result.summary.successCount}/{result.summary.totalChecks} Checks Passed)</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${
                      result.summary.passPercentage >= 80
                        ? 'bg-emerald-500'
                        : result.summary.passPercentage >= 50
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${result.summary.passPercentage}%` }}
                  />
                </div>
              </div>
            )}

            {/* Granular Multi-Check Diagnostic Matrix */}
            {result.checks && result.checks.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-blue-600" />
                  Forensic Diagnostic Layers (Success & Loss Breakdown):
                </h4>

                <div className="space-y-2">
                  {result.checks.map(chk => (
                    <div
                      key={chk.id}
                      className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors ${
                        chk.status === 'success'
                          ? 'bg-white border-emerald-200/80 hover:border-emerald-300'
                          : chk.status === 'warning'
                          ? 'bg-amber-50/50 border-amber-200 hover:border-amber-300'
                          : 'bg-red-50/50 border-red-200 hover:border-red-300'
                      }`}
                    >
                      <div className="space-y-0.5 max-w-2xl">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${
                            chk.status === 'success'
                              ? 'bg-emerald-500'
                              : chk.status === 'warning'
                              ? 'bg-amber-500'
                              : 'bg-red-500'
                          }`} />
                          <span className="font-bold text-slate-900">{chk.name}</span>
                        </div>
                        <p className="text-slate-600 pl-4">{chk.details}</p>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-center pl-4 sm:pl-0">
                        {chk.metric && (
                          <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            {chk.metric}
                          </span>
                        )}
                        <span
                          className={`px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] tracking-wider ${
                            chk.status === 'success'
                              ? 'bg-emerald-100 text-emerald-800'
                              : chk.status === 'warning'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {chk.status === 'success' ? 'PASSED' : chk.status === 'warning' ? 'ALERT' : 'LOSS'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cryptographic Hashes Card */}
            <div className="p-4 rounded-xl bg-slate-900 text-slate-100 text-xs font-mono space-y-3">
              <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-2">
                <span className="font-sans font-bold uppercase tracking-wider text-[11px]">
                  Cryptographic Ledger Proofs
                </span>
                <span className="text-[10px] text-slate-400">Timestamp: {new Date(result.verifiedAt).toLocaleTimeString()}</span>
              </div>

              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <span className="text-slate-400 font-sans">Target On-Chain Hash:</span>
                  <span className="text-cyan-400 break-all">{result.expectedHash || 'N/A'}</span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <span className="text-slate-400 font-sans">Calculated Binary Keccak-256:</span>
                  <span className={`${result.matches ? 'text-emerald-400 font-bold' : 'text-red-400'} break-all`}>
                    {result.computedHash}
                  </span>
                </div>

                {result.tamperCheckData?.calculated_content_hash && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className="text-slate-400 font-sans">Calculated RapidOCR Content Hash:</span>
                    <span className="text-indigo-300 break-all">
                      {result.tamperCheckData.calculated_content_hash}
                    </span>
                  </div>
                )}

                {result.ipfsCid && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pt-1 border-t border-slate-800">
                    <span className="text-slate-400 font-sans">IPFS Storage CID:</span>
                    <a
                      href={IPFSService.getGatewayUrl(result.ipfsCid)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline flex items-center gap-1 break-all"
                    >
                      {result.ipfsCid}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Associated Cadastral Dossier (if linked) */}
            {result.property && (
              <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-blue-950 block">
                    Cadastral Dossier Linked: {result.property.title}
                  </span>
                  <span className="text-blue-800 text-[11px]">
                    Survey Number: {result.property.surveyNumber} · {result.property.city}, {result.property.state} · Owner: {result.property.currentOwnerAddress.slice(0, 10)}...
                  </span>
                </div>
                <Link to={`/properties/${result.property.id}`}>
                  <Button variant="outline" size="sm" className="bg-white text-blue-900 border-blue-300 hover:bg-blue-100" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                    View Property
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
