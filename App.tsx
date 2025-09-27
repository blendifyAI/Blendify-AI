/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, ChangeEvent, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateProductShot, generatePromptSuggestion, generateAiModelShot } from './services/geminiService';
import { prepareImage, cropImage, dataURLtoBlob } from './lib/imageUtils';

// --- TYPE DEFINITIONS ---
type Mode = 'background' | 'ai-model';
type BackgroundSubMode = 'color' | 'scene';
type ServiceBackgroundSubMode = 'color' | 'scene' | 'transparent';
type Gender = 'Any' | 'Male' | 'Female';
type ModelSource = 'ai' | 'custom';
type LoadingStep = '' | 'Generating...';
type AppView = 'dashboard' | 'creations' | 'creation-detail';

interface ImageState {
  url: string | null;
  file: File | null;
  originalWidth: number;
  originalHeight: number;
}
interface PromptBuilderSettings {
    style: string;
    composition: string;
    lighting: string;
}
interface OperationStatus {
    isLoading: LoadingStep;
    error: string | null;
}
// State for features within the Background mode
interface BackgroundStatuses {
    color: OperationStatus;
    scene: OperationStatus;
    transparent: OperationStatus;
}
// State for features within the AI Model mode
interface AiModelStatuses {
    ai: OperationStatus;
    custom: OperationStatus;
}
interface AiModelPromptLoading {
    ai: boolean;
    custom: boolean;
}

// State for settings specific to a feature
interface FeatureSettings {
    backgroundColor: string;
    scenePrompt: string;
    promptEnhancer: boolean;
    aiGeneratedPrompt: string;
    yourModelPrompt: string;
    gender: Gender;
    promptBuilder: PromptBuilderSettings;
    modelImage: ImageState;
    aspectRatio: string;
}

// A record of settings for each distinct feature
type FeatureStates = Record<keyof GenerationStacks, Partial<FeatureSettings>>;


// Snapshot of all settings at the time of generation
interface GenerationStateSnapshot {
    mode: Mode;
    backgroundSubMode: BackgroundSubMode;
    modelSource: ModelSource;
    productImageUrl: string | null;
    featureStates: FeatureStates;
}

// For session history panel
interface SessionGeneration {
    id: number;
    src: string | null;
    status: 'loading' | 'done';
    featureKey: keyof GenerationStacks;
    snapshot: GenerationStateSnapshot;
}
// For feature-specific undo/redo stacks
interface GenerationStack {
    images: string[];
    currentIndex: number;
}
type GenerationStacks = {
    'background-color': GenerationStack;
    'background-scene': GenerationStack;
    'background-transparent': GenerationStack;
    'ai-model-ai': GenerationStack;
    'ai-model-custom': GenerationStack;
};


// --- UI CONSTANTS ---
const primaryButtonClasses = "font-permanent-marker text-xl text-center text-black bg-yellow-400 py-3 px-8 rounded-xl shadow-[0_4px_10px_rgba(250,204,21,0.4)] transition-all duration-200 hover:bg-yellow-300 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed";
const panelStyles = "p-4 space-y-4 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl";
const labelStyles = "block font-permanent-marker text-neutral-300 text-sm tracking-wider mb-2";
const inputStyles = "w-full bg-black/40 border border-white/20 rounded-lg p-2 text-neutral-200 focus:outline-none focus:ring-2 focus:ring-yellow-400";
const selectStyles = `${inputStyles} cursor-pointer`;


// --- ICON COMPONENTS ---
const InfoIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>);
const GenIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" {...props}><path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 001.84 1.84l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-1.84 1.84l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-1.84-1.84l-2.846-.813a.75.75 0 010-1.442l2.846-.813a3.75 3.75 0 001.84-1.84l.813 2.846A.75.75 0 019 4.5zM15.991 15.06a.75.75 0 01.581.422l.494 1.727a2.25 2.25 0 001.105 1.105l1.727.494a.75.75 0 010 1.342l-1.727.494a2.25 2.25 0 00-1.105 1.105l-.494 1.727a.75.75 0 01-1.342 0l-.494-1.727a2.25 2.25 0 00-1.105-1.105l-1.727-.494a.75.75 0 010-1.342l1.727-.494a2.25 2.25 0 001.105-1.105l.494-1.727a.75.75 0 01.76-.422z" clipRule="evenodd" /></svg>);
const UndoIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" {...props}><path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" /></svg>);
const RedoIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" {...props}><path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>);
const StartOverIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" {...props}><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>);
const BackgroundIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
);
const AiModelIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
    </svg>
);
const HistoryPlaceholderIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1} {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
);
const DownloadIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" {...props}><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>);
const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" {...props}><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>);
const ViewDetailsIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
);
const CloseIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>);

// --- NEW ICONS FOR SIDE PANEL ---
const LogoIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M9 8C7.34315 8 6 9.34315 6 11C6 12.6569 7.34315 14 9 14V8Z" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M15 8C16.6569 8 18 9.34315 18 11C18 12.6569 16.6569 14 15 14V8Z" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M9 14C9 16.2091 10.7909 18 13 18C13.6231 18 14.2131 17.8444 14.7354 17.5681" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M15 14C15 16.2091 13.2091 18 11 18C10.3769 18 9.78687 17.8444 9.26461 17.5681" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M12 18V21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M12 3V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M12 6C10.3431 6 9 7.34315 9 9V14H15V9C15 7.34315 13.6569 6 12 6Z" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M7 11H3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M7 9H2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M7 13H2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
);
const StudioIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
    </svg>
);
const CreationsIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Z" />
    </svg>
);
const SignInIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M12 15C14.7614 15 17 12.7614 17 10C17 7.23858 14.7614 5 12 5C9.23858 5 7 7.23858 7 10C7 12.7614 9.23858 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M19 21C19 17.134 15.866 14 12 14C8.13401 14 5 17.134 5 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

// --- NEW ICONS FOR MOBILE SIDEBAR ---
const MenuIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
);
const LightningIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
        <path fillRule="evenodd" d="M14.615 1.585a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .545 1.274l-8.25 11.25a.75.75 0 0 1-1.287-.587L11.018 14.25H3.75a.75.75 0 0 1-.545-1.274l8.25-11.25a.75.75 0 0 1 1.159-.136Z" clipRule="evenodd" />
    </svg>
);


// --- CHILD COMPONENTS ---

const UpgradeCard = ({ credits, onUpgrade, isDesktop = false }: { credits: number, onUpgrade: () => void, isDesktop?: boolean }) => {
    const commonClasses = "w-full rounded-2xl text-center group transition-all duration-300 ease-out transform hover:-translate-y-1 shadow-lg flex flex-col items-center justify-center";
    
    if (isDesktop) {
        return (
             <button 
                onClick={onUpgrade}
                className={`${commonClasses} p-3 bg-gradient-to-br from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 shadow-amber-500/20`}
            >
                <div className="flex items-center gap-1">
                    <LightningIcon className="w-4 h-4 text-yellow-900/80" />
                    <span className="font-bold text-xl text-yellow-900 font-sans -tracking-tight">{credits}</span>
                </div>
                <span className="font-bold text-[10px] text-yellow-900/90 mt-1 uppercase tracking-wider">
                    Upgrade
                </span>
            </button>
        );
    }

    // Mobile version
    return (
        <button 
            onClick={onUpgrade}
            className={`${commonClasses} p-4 bg-gradient-to-br from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 shadow-amber-500/30`}
        >
            <div className="flex items-center gap-2">
                <LightningIcon className="w-6 h-6 text-yellow-900/80" />
                <span className="font-bold text-4xl text-yellow-900 font-sans tracking-tighter">{credits}</span>
            </div>
            <span className="font-bold text-xl text-yellow-900/90 mt-1.5 tracking-wide uppercase">
                Upgrade
            </span>
        </button>
    );
};


const LoadingIndicator = ({ step }: { step: LoadingStep }) => (
    <div className="flex flex-col items-center justify-center h-full text-center">
        <svg className="animate-spin h-8 w-8 text-yellow-400 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        <p className="font-permanent-marker text-yellow-400 text-lg">{step}</p>
    </div>
);

const UploadPlaceholder = ({ title, onUpload, imageUrl }: { title: string, onUpload: (file: File) => void, imageUrl?: string | null }) => {
    const [isDraggingOver, setIsDraggingOver] = useState(false);

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onUpload(file);
        }
        e.target.value = '';
    };

    const handleDragEvents = (e: React.DragEvent<HTMLLabelElement>, isOver: boolean) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(isOver);
    };

    const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
        handleDragEvents(e, false);
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
            onUpload(file);
        }
    };
    
    return (
        <label 
            className={`bg-neutral-800/60 rounded-2xl cursor-pointer relative flex flex-col items-center justify-center p-6 h-40 transition-all group overflow-hidden ${isDraggingOver ? 'border-yellow-400' : ''}`}
            onDragOver={(e) => handleDragEvents(e, true)}
            onDragEnter={(e) => handleDragEvents(e, true)}
            onDragLeave={(e) => handleDragEvents(e, false)}
            onDrop={handleDrop}
        >
            {/* This is the inner dashed border */}
            <div className={`absolute inset-2 border-2 border-dashed rounded-xl transition-all pointer-events-none ${isDraggingOver ? 'border-yellow-400/80' : 'border-white/30'}`}></div>

            {imageUrl && (
                <img src={imageUrl} alt="preview" className="absolute inset-0 w-full h-full object-cover blur-sm opacity-20 group-hover:opacity-30 transition-opacity" />
            )}

            <div className="relative z-10 flex flex-col items-center text-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white/90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2 2v-4" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 10l5 5 5-5" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V3" />
                </svg>

                <span className="mt-4 font-permanent-marker text-lg text-neutral-100 drop-shadow-md uppercase">
                    {imageUrl ? `Change ${title}` : `Upload ${title}`}
                </span>
                <span className="text-sm text-neutral-400 mt-1">or drag and drop</span>
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </label>
    );
};


const getFileExtensionFromDataUrl = (dataUrl: string): string => {
    // Per the latest changes, all generated images are now high-quality PNGs.
    return 'png';
};

const GenerationResult = ({ src, alt, onDownload }: { src: string; alt: string; onDownload: (src: string) => void }) => {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-4 relative group">
            <img src={src} alt={alt} className="max-w-full max-h-full object-contain rounded-xl" />
            <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                    onClick={() => onDownload(src)}
                    className="bg-yellow-400 text-black font-bold py-2 px-4 rounded-lg shadow-lg hover:bg-yellow-300 transition-colors flex items-center gap-2"
                    aria-label="Download Image"
                >
                    <DownloadIcon />
                    Download
                </button>
            </div>
        </div>
    );
};

const HistoryControls = ({ canUndo, canRedo, onUndo, onRedo, onStartOver }: { canUndo: boolean, canRedo: boolean, onUndo: () => void, onRedo: () => void, onStartOver: () => void }) => {
    return (
        <div className="flex items-center gap-2 bg-black/40 backdrop-blur-sm p-1 rounded-lg">
            <button onClick={onUndo} disabled={!canUndo} className="p-2 rounded-lg hover:bg-white/20 disabled:text-neutral-500 disabled:hover:bg-transparent disabled:cursor-not-allowed" title="Undo">
                <UndoIcon />
            </button>
            <button onClick={onRedo} disabled={!canRedo} className="p-2 rounded-lg hover:bg-white/20 disabled:text-neutral-500 disabled:hover:bg-transparent disabled:cursor-not-allowed" title="Redo">
                <RedoIcon />
            </button>
             <div className="w-px h-5 bg-white/20 mx-1"></div>
            <button onClick={onStartOver} className="p-2 rounded-lg text-red-400 hover:bg-red-900/50" title="Start Over">
                <StartOverIcon />
            </button>
        </div>
    );
};

// --- INITIAL STATES ---
const initialProductImage: ImageState = { url: null, file: null, originalWidth: 0, originalHeight: 0 };
const initialModelImage: ImageState = { url: null, file: null, originalWidth: 0, originalHeight: 0 };

const initialPromptBuilder: PromptBuilderSettings = {
    style: 'Photorealistic',
    composition: 'Medium Shot',
    lighting: 'Natural Light',
};

const initialFeatureStates: FeatureStates = {
    'background-color': {
        backgroundColor: '#f0f0f0',
        aspectRatio: '1:1',
    },
    'background-scene': {
        scenePrompt: '',
        promptEnhancer: true,
        aspectRatio: '1:1',
    },
    'background-transparent': {}, // No settings needed
    'ai-model-ai': {
        aiGeneratedPrompt: '',
        gender: 'Any',
        promptBuilder: initialPromptBuilder,
        promptEnhancer: true,
        aspectRatio: '1:1',
    },
    'ai-model-custom': {
        yourModelPrompt: '',
        promptBuilder: initialPromptBuilder,
        promptEnhancer: true,
        modelImage: initialModelImage,
        aspectRatio: '1:1',
    },
};

const initialOpStatus: OperationStatus = { isLoading: '', error: null };
const initialBackgroundStatuses: BackgroundStatuses = {
    color: initialOpStatus,
    scene: initialOpStatus,
    transparent: initialOpStatus,
};
const initialAiModelStatuses: AiModelStatuses = {
    ai: initialOpStatus,
    custom: initialOpStatus,
};
const initialAiModelPromptLoading: AiModelPromptLoading = {
    ai: false,
    custom: false,
};

const initialGenerationStack: GenerationStack = { images: [], currentIndex: -1 };
const initialGenerationStacks: GenerationStacks = {
    'background-color': { ...initialGenerationStack, images: [] },
    'background-scene': { ...initialGenerationStack, images: [] },
    'background-transparent': { ...initialGenerationStack, images: [] },
    'ai-model-ai': { ...initialGenerationStack, images: [] },
    'ai-model-custom': { ...initialGenerationStack, images: [] },
};
const defaultFeatureSettings: FeatureSettings = {
    backgroundColor: '#f0f0f0',
    scenePrompt: '',
    promptEnhancer: true,
    aiGeneratedPrompt: '',
    yourModelPrompt: '',
    gender: 'Any',
    promptBuilder: initialPromptBuilder,
    modelImage: initialModelImage,
    aspectRatio: '1:1',
};


// --- REFACTORED VIEW COMPONENTS ---
const PromptEnhancerToggle = ({ isChecked, onChange }: { isChecked: boolean, onChange: () => void }) => (
    <div>
        <div className="flex items-center justify-between mb-2">
            <span className={labelStyles + ' mb-0'}>Prompt Enhancer</span>
            <div className="relative group">
                <InfoIcon className="cursor-help text-neutral-400" />
                <div className="absolute bottom-full right-0 mb-2 w-48 bg-neutral-800 text-neutral-200 text-xs rounded-lg py-2 px-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
                    Automatically enhances your prompt with professional photography terms for higher quality results.
                </div>
            </div>
        </div>
        <label htmlFor="optimizer-toggle" className="flex items-center cursor-pointer">
            <div className="relative">
                <input 
                    type="checkbox" 
                    id="optimizer-toggle" 
                    className="sr-only" 
                    checked={isChecked} 
                    onChange={onChange} 
                />
                <div className={`block w-14 h-8 rounded-full transition-colors ${isChecked ? 'bg-yellow-800' : 'bg-black/20'}`}></div>
                <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${isChecked ? 'transform translate-x-full bg-yellow-400' : ''}`}></div>
            </div>
        </label>
    </div>
);

const SettingsPanelContent = (props: any) => {
    const {
        mode, handleSetMode, backgroundSubMode, handleSetBackgroundSubMode,
        uploadKey, handleFileUpload, productImage, colorSwatches,
        modelSource, handleSetModelSource, isAiModelPromptLoading, 
        isScenePromptLoading, handlePromptGen,
        backgroundStatuses, aiModelStatuses,
        featureState, onFeatureStateChange
    } = props;
    
    const {
        backgroundColor, scenePrompt, promptEnhancer,
        modelImage, aiGeneratedPrompt, yourModelPrompt, gender, promptBuilder,
        aspectRatio,
    } = featureState;

    const setBackgroundColor = (v: string) => onFeatureStateChange({ backgroundColor: v });
    const setScenePrompt = (v: string) => onFeatureStateChange({ scenePrompt: v });
    const handleEnhancerChange = () => onFeatureStateChange({ promptEnhancer: !promptEnhancer });
    const setAiGeneratedPrompt = (v: string) => onFeatureStateChange({ aiGeneratedPrompt: v });
    const setYourModelPrompt = (v: string) => onFeatureStateChange({ yourModelPrompt: v });
    const setGender = (v: Gender) => onFeatureStateChange({ gender: v });
    const setAspectRatio = (v: string) => onFeatureStateChange({ aspectRatio: v });
    const handlePromptBuilderChange = (e: ChangeEvent<HTMLSelectElement>) => {
        const { name, value } = e.target;
        onFeatureStateChange({
            promptBuilder: { ...promptBuilder, [name]: value }
        });
    };

    const AspectRatioSelector = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
        const ratios = ['1:1', '9:16', '16:9', '3:4', '4:3', '4:5'];
        return (
            <div>
                <label className={labelStyles + ' text-xs text-neutral-400 mb-1'}>Aspect Ratio</label>
                <div className="grid grid-cols-3 gap-2">
                    {ratios.map(ratio => (
                        <button 
                            key={ratio} 
                            onClick={() => onChange(ratio)} 
                            className={`py-2 px-1 text-center rounded-lg text-sm font-bold transition-colors ${value === ratio ? 'bg-yellow-400 text-black' : 'bg-black/40 hover:bg-white/10 text-neutral-300'}`}
                        >
                            {ratio}
                        </button>
                    ))}
                </div>
            </div>
        );
    };

    return (
    <div className="space-y-4">
        <div className={panelStyles}>
            <label className={labelStyles}>Mode</label>
            <div className="grid grid-cols-2 gap-2">
                <button 
                    onClick={() => handleSetMode('background')} 
                    className={`flex flex-col items-center justify-center p-4 rounded-2xl transition-colors duration-200 h-24 font-semibold
                        ${mode === 'background' ? 'bg-yellow-400 text-black' : 'bg-black/40 hover:bg-white/10 text-neutral-300'}`
                    }
                >
                    <BackgroundIcon className="w-6 h-6 mb-2" />
                    <span>Background</span>
                </button>
                <button 
                    onClick={() => handleSetMode('ai-model')} 
                    className={`flex flex-col items-center justify-center p-4 rounded-2xl transition-colors duration-200 h-24 font-semibold
                        ${mode === 'ai-model' ? 'bg-yellow-400 text-black' : 'bg-black/40 hover:bg-white/10 text-neutral-300'}`
                    }
                >
                    <AiModelIcon className="w-6 h-6 mb-2" />
                    <span>AI Model</span>
                </button>
            </div>
        </div>

        <AnimatePresence mode="wait">
            <motion.div
                key={mode}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
            >
                {mode === 'background' && (
                    <>
                    <UploadPlaceholder key={`product-upload-${uploadKey}`} title="Product" onUpload={(file) => handleFileUpload(file, 'product')} imageUrl={productImage.url} />
                    <div className={panelStyles}>
                        <div className="flex bg-black/20 rounded-lg p-1">
                            <button onClick={() => handleSetBackgroundSubMode('color')} className={`w-1/2 rounded-md py-2 text-sm font-bold transition-colors ${backgroundSubMode === 'color' ? 'bg-yellow-400 text-black' : 'hover:bg-white/10'}`}>Color</button>
                            <button onClick={() => handleSetBackgroundSubMode('scene')} className={`w-1/2 rounded-md py-2 text-sm font-bold transition-colors ${backgroundSubMode === 'scene' ? 'bg-yellow-400 text-black' : 'hover:bg-white/10'}`}>AI Scene</button>
                        </div>
                        <div className="relative">
                            <AnimatePresence mode="wait" initial={false}>
                                {backgroundSubMode === 'color' && (
                                    <motion.div
                                        key="background-color-panel"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <div className="space-y-4">
                                            <div>
                                                <label className={labelStyles + " uppercase"}>Background Color</label>
                                                <div className="flex items-center gap-3 w-full bg-black/40 border border-white/20 rounded-lg p-2 focus-within:ring-2 focus-within:ring-yellow-400 transition-shadow">
                                                    <label htmlFor="color-picker" className="relative w-9 h-9 rounded-full cursor-pointer shrink-0 border border-white/20">
                                                        <div 
                                                            className="w-full h-full rounded-full"
                                                            style={{
                                                                backgroundColor: backgroundColor === 'transparent' ? 'transparent' : backgroundColor,
                                                                backgroundImage: backgroundColor === 'transparent' ? `linear-gradient(45deg, #808080 25%, transparent 25%), linear-gradient(-45deg, #808080 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #808080 75%), linear-gradient(-45deg, transparent 75%, #808080 75%)` : 'none',
                                                                backgroundSize: '8px 8px',
                                                                backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px'
                                                            }}
                                                        ></div>
                                                        <input 
                                                            id="color-picker" 
                                                            type="color" 
                                                            value={backgroundColor === 'transparent' ? '#ffffff' : backgroundColor} 
                                                            onChange={(e) => setBackgroundColor(e.target.value)} 
                                                            className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
                                                            aria-label="Custom color picker"
                                                        />
                                                    </label>
                                                    <input 
                                                        type="text" 
                                                        value={backgroundColor === 'transparent' ? 'transparent' : backgroundColor} 
                                                        onChange={(e) => setBackgroundColor(e.target.value)} 
                                                        className="w-full bg-transparent border-none text-neutral-200 placeholder:text-neutral-500 focus:outline-none disabled:bg-transparent disabled:text-neutral-500"
                                                        aria-label="Hex color value"
                                                        disabled={backgroundColor === 'transparent'}
                                                    />
                                                </div>
                                                <div className="grid grid-cols-6 gap-4 justify-items-center mt-4">
                                                    <div className="relative">
                                                        {backgroundColor === 'transparent' && <div className="absolute inset-[-4px] ring-2 ring-yellow-400 rounded-full" />}
                                                        <button
                                                            onClick={() => setBackgroundColor('transparent')}
                                                            className="h-9 w-9 rounded-full border border-white/20 transition-transform hover:scale-110 focus:outline-none relative overflow-hidden"
                                                            style={{
                                                                backgroundImage: 'linear-gradient(45deg, #808080 25%, transparent 25%), linear-gradient(-45deg, #808080 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #808080 75%), linear-gradient(-45deg, transparent 75%, #808080 75%)',
                                                                backgroundSize: '10px 10px',
                                                                backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px'
                                                            }}
                                                            aria-label="Select transparent background"
                                                        />
                                                    </div>
                                                    {colorSwatches.map(swatch => 
                                                        <div key={swatch} className="relative">
                                                            {backgroundColor === swatch && <div className="absolute inset-[-4px] ring-2 ring-yellow-400 rounded-full" />}
                                                            <button 
                                                                onClick={() => setBackgroundColor(swatch)} 
                                                                className="h-9 w-9 rounded-full border border-black/20 transition-transform hover:scale-110 focus:outline-none" 
                                                                style={{ backgroundColor: swatch }} 
                                                                aria-label={`Select color ${swatch}`}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <AspectRatioSelector value={aspectRatio} onChange={setAspectRatio} />
                                        </div>
                                    </motion.div>
                                )}
                                {backgroundSubMode === 'scene' && (
                                    <motion.div
                                        key="background-scene-panel"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <div className="space-y-4">
                                            <div>
                                                <label htmlFor="scene-prompt" className={labelStyles}>AI Scene Prompt</label>
                                                <div className="relative">
                                                    <textarea id="scene-prompt" value={scenePrompt} onChange={(e) => setScenePrompt(e.target.value)} placeholder="e.g., resting on a mossy rock by a stream" rows={3} className={`${inputStyles} pr-12`} />
                                                    <button onClick={handlePromptGen} disabled={isScenePromptLoading || !productImage.url || !!backgroundStatuses.scene.isLoading} title="Generate prompt from product image" className="absolute top-2 right-2 p-1 text-yellow-400 bg-black/20 rounded-lg h-8 w-8 flex items-center justify-center hover:bg-white/10 disabled:text-neutral-500 disabled:cursor-not-allowed">
                                                        {isScenePromptLoading ? <div className="w-5 h-5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></div> : <GenIcon />}
                                                    </button>
                                                </div>
                                            </div>
                                            <AspectRatioSelector value={aspectRatio} onChange={setAspectRatio} />
                                            <PromptEnhancerToggle isChecked={promptEnhancer} onChange={handleEnhancerChange} />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                    </>
                )}
                {mode === 'ai-model' && (
                    <>
                        <div className={panelStyles}>
                            <label className={labelStyles}>Model Source</label>
                            <div className="flex bg-black/40 rounded-xl p-1">
                                <button onClick={() => handleSetModelSource('ai')} className={`w-1/2 rounded-lg py-2 text-base transition-colors ${modelSource === 'ai' ? 'bg-yellow-400 text-black font-bold' : 'font-medium text-neutral-300 hover:bg-white/10'}`}>AI Generated</button>
                                <button onClick={() => handleSetModelSource('custom')} className={`w-1/2 rounded-lg py-2 text-base transition-colors ${modelSource === 'custom' ? 'bg-yellow-400 text-black font-bold' : 'font-medium text-neutral-300 hover:bg-white/10'}`}>Your Model</button>
                            </div>
                        </div>
                        {modelSource === 'custom' && (
                            <UploadPlaceholder key={`model-upload-${uploadKey}`} title="Your Model" onUpload={(file) => handleFileUpload(file, 'model')} imageUrl={modelImage.url} />
                        )}
                        <UploadPlaceholder key={`product-upload-${uploadKey}`} title="Product" onUpload={(file) => handleFileUpload(file, 'product')} imageUrl={productImage.url} />
                        <div className={panelStyles}>
                            <label htmlFor="ai-prompt" className={labelStyles}>AI Model Prompt</label>
                            <div className="relative">
                                <textarea 
                                    id="ai-prompt" 
                                    value={modelSource === 'ai' ? aiGeneratedPrompt : yourModelPrompt} 
                                    onChange={(e) => modelSource === 'ai' ? setAiGeneratedPrompt(e.target.value) : setYourModelPrompt(e.target.value)} 
                                    placeholder={modelSource === 'ai' ? "e.g., a woman hiking in the mountains..." : "e.g., a man running on a city street at night"} 
                                    rows={3} 
                                    className={`${inputStyles} pr-12`} 
                                />
                                <button 
                                    onClick={handlePromptGen} 
                                    disabled={isAiModelPromptLoading[modelSource] || !!aiModelStatuses[modelSource].isLoading || (modelSource === 'ai' ? !productImage.url : (!productImage.url || !modelImage.url))} 
                                    title={modelSource === 'ai' ? "Generate prompt from product image" : "Generate prompt from product and model images"} 
                                    className="absolute top-2 right-2 p-1 text-yellow-400 bg-black/20 rounded-lg h-8 w-8 flex items-center justify-center hover:bg-white/10 disabled:text-neutral-500 disabled:cursor-not-allowed"
                                >
                                    {isAiModelPromptLoading[modelSource] ? <div className="w-5 h-5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></div> : <GenIcon />}
                                </button>
                            </div>
                        </div>
                        <div className={panelStyles}>
                            <h3 className={labelStyles}>Creative Controls</h3>
                            <div className="grid grid-cols-1 gap-4">
                                <AspectRatioSelector value={aspectRatio} onChange={setAspectRatio} />
                                {modelSource === 'ai' && (
                                <div>
                                    <label className={labelStyles + ' text-xs text-neutral-400 mb-1'}>Gender</label>
                                    <div className="flex bg-black/20 rounded-lg p-1">
                                        {(['Any', 'Male', 'Female'] as Gender[]).map(g => (
                                            <button key={g} onClick={() => setGender(g)} className={`w-1/3 rounded-md py-2 text-sm font-bold transition-colors ${gender === g ? 'bg-yellow-400 text-black' : 'hover:bg-white/10'}`}>{g}</button>
                                        ))}
                                    </div>
                                </div>
                                )}
                                <div>
                                    <label htmlFor="style-select" className="text-xs text-neutral-400">Style</label>
                                    <select id="style-select" name="style" value={promptBuilder.style} onChange={handlePromptBuilderChange} className={selectStyles}>
                                        <option>Photorealistic</option>
                                        <option>Cinematic</option>
                                        <option>Product Shot</option>
                                        <option>Fashion Editorial</option>
                                        <option>Lifestyle</option>
                                        <option>Vintage Photo</option>
                                        <option>Black and White</option>
                                        <option>Dramatic</option>
                                        <option>Minimalist</option>
                                        <option>3D Render</option>
                                        <option>Fantasy Art</option>
                                        <option>Watercolor</option>
                                        <option>Anime</option>
                                        <option>Abstract</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="composition-select" className="text-xs text-neutral-400">Composition</label>
                                    <select id="composition-select" name="composition" value={promptBuilder.composition} onChange={handlePromptBuilderChange} className={selectStyles}>
                                        <option>Medium Shot</option>
                                        <option>Close-up</option>
                                        <option>Full Shot</option>
                                        <option>Portrait</option>
                                        <option>Wide Shot</option>
                                        <option>Cowboy Shot</option>
                                        <option>Low Angle</option>
                                        <option>High Angle</option>
                                        <option>Top-down</option>
                                        <option>Dutch Angle</option>
                                        <option>Over-the-shoulder</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="lighting-select" className="text-xs text-neutral-400">Lighting</label>
                                    <select id="lighting-select" name="lighting" value={promptBuilder.lighting} onChange={handlePromptBuilderChange} className={selectStyles}>
                                        <option>Studio Lighting</option>
                                        <option>Natural Light</option>
                                        <option>Soft Light</option>
                                        <option>Hard Light</option>
                                        <option>Cinematic Lighting</option>
                                        <option>Dramatic Lighting</option>
                                        <option>Golden Hour</option>
                                        <option>Backlit</option>
                                    </select>
                                </div>
                                <PromptEnhancerToggle isChecked={promptEnhancer} onChange={handleEnhancerChange} />
                            </div>
                        </div>
                    </>
                )}
            </motion.div>
        </AnimatePresence>
    </div>
    );
};
    
const CreationsGallery = (props: any) => {
    const { 
        sessionGenerations, onViewDetails, onGoToStudio,
    } = props;

    return sessionGenerations.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <AnimatePresence>
                {sessionGenerations.map((gen) => (
                    <motion.div
                        key={gen.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                        className="aspect-square"
                    >
                        <button 
                            onClick={() => onViewDetails(gen.id)}
                            disabled={gen.status !== 'done'}
                            className="w-full h-full rounded-lg bg-neutral-800 flex-shrink-0 overflow-hidden relative group disabled:cursor-not-allowed"
                        >
                            {gen.status === 'loading' && (
                                <div className="w-full h-full flex items-center justify-center bg-neutral-800 animate-pulse">
                                    <svg className="animate-spin h-8 w-8 text-yellow-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                </div>
                            )}
                            {gen.src && (
                                <>
                                    <img src={gen.src} alt={`Creation ${gen.id}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                                        <ViewDetailsIcon className="w-10 h-10 text-white transform group-hover:scale-110 transition-transform duration-300" />
                                    </div>
                                </>
                            )}
                            <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-lg"></div>
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    ) : (
        <div className="flex flex-col items-center justify-center h-full text-center text-neutral-600 p-8 space-y-4">
            <HistoryPlaceholderIcon className="h-24 w-24 text-neutral-700 mb-4" />
            <p className="font-permanent-marker text-2xl text-neutral-400">Create your first image</p>
            <p className="text-base text-neutral-500 max-w-xs mx-auto">
                Your studio is ready. Let your creativity flow and generate your first masterpiece.
            </p>
            <button 
                onClick={onGoToStudio} 
                className="font-permanent-marker text-xl text-center text-yellow-400 bg-transparent border-2 border-yellow-400 py-3 px-8 rounded-xl transition-all duration-200 hover:bg-yellow-400 hover:text-black mt-6"
            >
                Start creating
            </button>
        </div>
    )
};

const CanvasView = (props: any) => {
    const { currentStatus, canvasDisplayUrl, handleDownload, productImage, mode, canUndo, canRedo, onUndo, onRedo, onStartOver } = props;
    
    return (
        <div className="w-full h-full flex items-center justify-center rounded-3xl p-4 studio-canvas relative">
            <div className="absolute top-4 right-4 z-10">
                <HistoryControls 
                    canUndo={canUndo}
                    canRedo={canRedo}
                    onUndo={onUndo}
                    onRedo={onRedo}
                    onStartOver={onStartOver}
                />
            </div>

            {currentStatus.isLoading && <LoadingIndicator step={currentStatus.isLoading} />}
            {currentStatus.error && !currentStatus.isLoading && <div className="text-center text-red-400 p-4 bg-red-900/20 rounded-lg"><strong>Error:</strong> {currentStatus.error}</div>}
            
            {!currentStatus.isLoading && !currentStatus.error && (
                <>
                {canvasDisplayUrl ? (
                    <GenerationResult src={canvasDisplayUrl} alt="Generated result" onDownload={handleDownload}/>
                ) : productImage.url && (mode === 'background' || (mode === 'ai-model' && productImage.url)) ? (
                    <img src={productImage.url} alt="Product preview" className="max-w-full max-h-full object-contain rounded-xl" />
                ) : (
                    <div className="text-center text-neutral-400">
                        <h2 className="text-xl font-permanent-marker tracking-widest" style={{ color: '#9e9e9e' }}>
                            UPLOAD A PRODUCT TO BEGIN
                        </h2>
                        <p className="text-sm mt-1" style={{ color: '#757575' }}>
                            Your creative studio awaits.
                        </p>
                    </div>
                )}
                </>
            )}
            <div className="studio-canvas-handle"></div>
        </div>
    );
};


// --- NEW/UPDATED DEDICATED VIEW COMPONENTS ---

const MobileHeader = ({ onMenuClick }: { onMenuClick: () => void }) => (
    <header className="fixed top-0 left-0 right-0 h-16 bg-neutral-900/80 backdrop-blur-sm border-b border-white/10 flex items-center justify-between px-4 z-30">
        <div className="flex items-center gap-2">
            <LogoIcon className="w-7 h-7 text-neutral-400"/>
            <span className="font-permanent-marker text-xl text-neutral-200">Blendify AI</span>
        </div>
        <button onClick={onMenuClick} className="p-2 -mr-2 text-neutral-300 hover:text-white">
            <MenuIcon className="w-6 h-6" />
        </button>
    </header>
);

const MobileSidebar = ({ isOpen, onClose, activeView, setActiveView, newHistoryNotification, setNewHistoryNotification }: any) => {
    const handleNavClick = (view: AppView) => {
        setActiveView(view);
        if (view === 'creations') {
            setNewHistoryNotification(false);
        }
        onClose();
    };

    const SidebarNavButton = ({ icon, label, isActive, onClick, isDisabled = false, hasNotification = false }: any) => (
        <button
            onClick={onClick}
            disabled={isDisabled}
            className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-left transition-colors relative ${isActive ? 'bg-neutral-800 text-yellow-300' : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-white'} ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
            {icon}
            <span className="font-bold text-lg">{label}</span>
            {hasNotification && <span className="absolute top-1/2 right-4 -translate-y-1/2 block h-2.5 w-2.5 rounded-full bg-yellow-400"></span>}
        </button>
    );

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        className="fixed inset-0 bg-black/60 z-40 lg:hidden"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />
                    <motion.aside
                        className="fixed inset-0 w-full h-full bg-neutral-900 p-4 z-50 flex flex-col lg:hidden"
                        initial={{ x: '-100%' }}
                        animate={{ x: '0%' }}
                        exit={{ x: '-100%' }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    >
                        <div className="flex items-center justify-between p-2 mb-4">
                            <LogoIcon className="w-8 h-8 text-neutral-400"/>
                             <button onClick={onClose} className="p-2 text-neutral-400 hover:text-white" aria-label="Close menu">
                                <CloseIcon className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="flex-grow flex flex-col justify-start items-center space-y-4 px-4 pt-10">
                            <SidebarNavButton 
                                label="Studio"
                                icon={<StudioIcon className="w-7 h-7" />}
                                isActive={activeView === 'dashboard'}
                                onClick={() => handleNavClick('dashboard')}
                            />
                            <SidebarNavButton 
                                label="Creations"
                                icon={<CreationsIcon className="w-7 h-7" />}
                                isActive={activeView === 'creations'}
                                onClick={() => handleNavClick('creations')}
                                hasNotification={newHistoryNotification}
                            />
                        </div>
                        <div className="space-y-4">
                            <UpgradeCard credits={3} onUpgrade={() => {}} />
                            <button className="w-full py-3.5 px-4 bg-stone-800 text-neutral-200 rounded-xl flex items-center justify-center gap-3 text-lg font-bold hover:bg-stone-700 transition-colors">
                                <SignInIcon className="w-6 h-6" />
                                <span>Sign In</span>
                            </button>
                        </div>
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
};

const ReadOnlySettings = ({ snapshot }: { snapshot: GenerationStateSnapshot }) => {
    const { mode, backgroundSubMode, modelSource, featureStates, productImageUrl } = snapshot;
    
    // Determine the specific feature key and settings from the snapshot
    const featureKey = useMemo((): keyof GenerationStacks => {
        if (mode === 'background') {
            const isTransparent = backgroundSubMode === 'color' && featureStates['background-color']?.backgroundColor === 'transparent';
            return isTransparent ? 'background-transparent' : `background-${backgroundSubMode}`;
        }
        return `ai-model-${modelSource}`;
    }, [mode, backgroundSubMode, modelSource, featureStates]);

    const settings = { ...defaultFeatureSettings, ...featureStates[featureKey] };

    const SettingItem = ({ label, value, isCode = false }: { label: string, value: React.ReactNode, isCode?: boolean }) => {
        if (!value && value !== false && value !== 0) return null;
        return (
            <div className="mb-4 last:mb-0">
                <h4 className="block font-permanent-marker text-neutral-400 text-xs tracking-wider mb-1 uppercase">{label}</h4>
                {isCode ? (
                    <p className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-sm text-neutral-200 whitespace-pre-wrap break-words font-mono selection:bg-yellow-400/20">{value}</p>
                ) : (
                    <p className="text-base text-neutral-100 break-words">{value}</p>
                )}
            </div>
        );
    };
    
    return (
         <div className="space-y-4">
            <div className={panelStyles}>
                 <SettingItem label="Mode" value={mode === 'background' ? 'Background' : 'AI Model'} />
                 {mode === 'background' && <SettingItem label="Sub-Mode" value={backgroundSubMode === 'color' ? 'Color' : 'AI Scene'} />}
                 {mode === 'ai-model' && <SettingItem label="Model Source" value={modelSource === 'ai' ? 'AI Generated' : 'Your Model'} />}
                 <SettingItem label="Aspect Ratio" value={settings.aspectRatio} />
            </div>

            {(productImageUrl || (settings.modelImage && settings.modelImage.url)) && (
                <div className={panelStyles}>
                    <h3 className={labelStyles}>Input Images</h3>
                    <div className="grid grid-cols-2 gap-2">
                        {productImageUrl && (
                            <div>
                                <label className="text-xs text-neutral-400">Product</label>
                                <img src={productImageUrl} alt="Product Input" className="w-full rounded-lg mt-1" />
                            </div>
                        )}
                        {settings.modelImage && settings.modelImage.url && (
                             <div>
                                <label className="text-xs text-neutral-400">Model</label>
                                <img src={settings.modelImage.url} alt="Model Input" className="w-full rounded-lg mt-1" />
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            <div className={panelStyles}>
                <h3 className={labelStyles}>Generation Settings</h3>
                {mode === 'background' && backgroundSubMode === 'color' && <SettingItem label="Background Color" value={settings.backgroundColor} />}
                {mode === 'background' && backgroundSubMode === 'scene' && <SettingItem label="Scene Prompt" value={settings.scenePrompt} isCode />}
                
                {mode === 'ai-model' && modelSource === 'ai' && <SettingItem label="Prompt" value={settings.aiGeneratedPrompt} isCode />}
                {mode === 'ai-model' && modelSource === 'custom' && <SettingItem label="Prompt" value={settings.yourModelPrompt} isCode />}

                {mode === 'ai-model' && modelSource === 'ai' && <SettingItem label="Gender" value={settings.gender} />}

                <SettingItem label="Prompt Enhancer" value={settings.promptEnhancer ? 'Enabled' : 'Disabled'} />
            </div>

             {mode === 'ai-model' && settings.promptBuilder && (
                 <div className={panelStyles}>
                     <h3 className={labelStyles}>Creative Controls</h3>
                     <SettingItem label="Style" value={settings.promptBuilder.style} />
                     <SettingItem label="Composition" value={settings.promptBuilder.composition} />
                     <SettingItem label="Lighting" value={settings.promptBuilder.lighting} />
                 </div>
             )}
        </div>
    );
};

const CreationDetailView = ({ creation, onBack, onDownload, onDelete }: { creation: SessionGeneration, onBack: () => void, onDownload: (src: string) => void, onDelete: (id: number) => void }) => {
    return (
        <>
            <main className="flex-1 flex flex-col items-center justify-center studio-background p-8 relative">
                 <div className="absolute top-6 left-6 z-10">
                    <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-sm rounded-lg hover:bg-white/20 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" /></svg>
                        Back to Creations
                    </button>
                </div>
                <div className="w-full h-full">
                    {creation.src && <GenerationResult src={creation.src} alt={`Creation ${creation.id}`} onDownload={onDownload} />}
                </div>
            </main>
            <aside className="w-96 flex-shrink-0 bg-black/20 flex flex-col">
                <div className="flex-grow overflow-y-auto p-4">
                    <h2 className="text-xl font-permanent-marker text-neutral-200 mb-4">Creation Details</h2>
                    <ReadOnlySettings snapshot={creation.snapshot} />
                </div>
                <div className="p-4 flex-shrink-0 bg-gradient-to-t from-neutral-900/80 flex items-center gap-2">
                    <button onClick={() => onDownload(creation.src!)} className="flex-1 flex items-center justify-center gap-2 bg-yellow-400 text-black font-bold py-3 px-4 rounded-lg shadow-lg hover:bg-yellow-300 transition-colors">
                        <DownloadIcon /> Download
                    </button>
                    <button 
                        onClick={() => { onDelete(creation.id); onBack(); }} 
                        className="p-3 rounded-lg text-neutral-300 bg-red-900/40 hover:bg-red-900/60 hover:text-red-300 transition-colors"
                        title="Delete"
                    >
                        <TrashIcon />
                    </button>
                </div>
            </aside>
        </>
    );
};

const MobileCreationDetailView = ({ creation, onBack, onDownload, onDelete }: { creation: SessionGeneration, onBack: () => void, onDownload: (src: string) => void, onDelete: (id: number) => void }) => {
    return (
        <div className="flex flex-col h-full">
             <header className="flex-shrink-0 bg-black/20 backdrop-blur-sm border-b border-white/10 h-16 flex items-center justify-between px-4 z-30">
                <button onClick={onBack} className="flex items-center gap-2 p-2 -ml-2 rounded-lg hover:bg-white/20">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" /></svg>
                    <span>Back</span>
                </button>
                <h1 className="text-lg font-permanent-marker text-neutral-300">Creation Details</h1>
                 <button 
                    onClick={() => { onDelete(creation.id); onBack(); }} 
                    className="p-2 -mr-2 rounded-lg text-neutral-300 hover:bg-red-900/60 hover:text-red-300"
                    title="Delete"
                >
                    <TrashIcon />
                </button>
            </header>
            <main className="flex-1 overflow-y-auto p-4 space-y-4">
                 <div className="w-full aspect-square studio-background rounded-3xl -mt-2">
                    {creation.src && <img src={creation.src} alt={`Creation ${creation.id}`} className="w-full h-full object-contain rounded-xl" />}
                 </div>
                 <ReadOnlySettings snapshot={creation.snapshot} />
            </main>
             <div className="p-4 flex-shrink-0 bg-gradient-to-t from-neutral-900">
                <button onClick={() => onDownload(creation.src!)} className="w-full flex items-center justify-center gap-2 bg-yellow-400 text-black font-bold py-3 px-4 rounded-lg shadow-lg hover:bg-yellow-300 transition-colors">
                    <DownloadIcon /> Download
                </button>
            </div>
        </div>
    );
};

// --- MAIN APP COMPONENT ---
export default function App() {
    // --- STATE MANAGEMENT ---
    // "Live" state representing the user's current work-in-progress.
    const [mode, setMode] = useState<Mode>('background');
    const [backgroundSubMode, setBackgroundSubMode] = useState<BackgroundSubMode>('color');
    const [modelSource, setModelSource] = useState<ModelSource>('ai');
    const [productImage, setProductImage] = useState<ImageState>(initialProductImage);
    const [featureStates, setFeatureStates] = useState<FeatureStates>(initialFeatureStates);

    // State for managing the view when browsing history.
    const [activeGenerationId, setActiveGenerationId] = useState<number | null>(null);
    const [detailedCreation, setDetailedCreation] = useState<SessionGeneration | null>(null);

    // UI and session state
    const [uploadKey, setUploadKey] = useState(0);
    const [activeView, setActiveView] = useState<AppView>('dashboard');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [newHistoryNotification, setNewHistoryNotification] = useState(false);

    // Generation histories (undo/redo) for each feature
    const [generationStacks, setGenerationStacks] = useState<GenerationStacks>(initialGenerationStacks);

    // Visual log of all generations for the history panel
    const [sessionGenerations, setSessionGenerations] = useState<SessionGeneration[]>([]);
    const generationIdCounter = useRef(0);
    
    // Statuses for API operations
    const [backgroundStatuses, setBackgroundStatuses] = useState<BackgroundStatuses>(initialBackgroundStatuses);
    const [aiModelStatuses, setAiModelStatuses] = useState<AiModelStatuses>(initialAiModelStatuses);
    const [isScenePromptLoading, setIsScenePromptLoading] = useState(false);
    const [isAiModelPromptLoading, setIsAiModelPromptLoading] = useState<AiModelPromptLoading>(initialAiModelPromptLoading);
    
    const colorSwatches = useMemo(() => [
        '#ffffff', '#f1f5f9', '#94a3b8', '#475569', '#1e293b', '#000000',
        '#fecaca', '#fed7aa', '#bbf7d0', '#bfdbfe', '#e9d5ff', '#fbcfe8',
        '#dc2626', '#f97316', '#16a34a', '#2563eb', '#7c3aed', '#db2777',
        '#eaddc7', '#0a2342', '#556b2f', '#ffdb58', '#800020'
    ], []);

    // --- DERIVED STATE FOR UI DISPLAY ---
    const getCurrentFeatureKey = useMemo((): keyof GenerationStacks => {
        if (mode === 'background') {
            const isTransparent = backgroundSubMode === 'color' && featureStates['background-color']?.backgroundColor === 'transparent';
            const effectiveSubMode = isTransparent ? 'transparent' : backgroundSubMode;
            return `background-${effectiveSubMode}`;
        }
        return `ai-model-${modelSource}`;
    }, [mode, backgroundSubMode, featureStates, modelSource]);

    const currentFeatureKeyRef = useRef(getCurrentFeatureKey);
    useEffect(() => {
        currentFeatureKeyRef.current = getCurrentFeatureKey;
    }, [getCurrentFeatureKey]);

    const currentFeatureState = useMemo((): FeatureSettings => {
        return {
            ...defaultFeatureSettings,
            ...featureStates[getCurrentFeatureKey],
        };
    }, [featureStates, getCurrentFeatureKey]);

    const updateCurrentFeatureState = (update: Partial<FeatureSettings>) => {
        const featureKey = currentFeatureKeyRef.current;
        setFeatureStates(prev => ({
            ...prev,
            [featureKey]: {
                ...(prev[featureKey] ?? {}),
                ...update,
            }
        }));
    };
    
    useEffect(() => {
        if (mode === 'background') {
            const isTransparent = backgroundSubMode === 'color' && featureStates['background-color']?.backgroundColor === 'transparent';
            const effectiveSubMode = isTransparent ? 'transparent' : backgroundSubMode;
            setBackgroundStatuses(s => ({ ...s, [effectiveSubMode]: { ...s[effectiveSubMode], error: null }}));
        }
        if (mode === 'ai-model') {
            setAiModelStatuses(s => ({ ...s, [modelSource]: { ...s[modelSource], error: null }}));
        }
    }, [mode, backgroundSubMode, modelSource, featureStates]);


    // --- HISTORY MANAGEMENT ---
    const recordNewGeneration = (
        imageUrl: string,
        generationId: number,
        featureKey: keyof GenerationStacks
    ) => {
        setSessionGenerations(prev => prev.map(gen => 
            gen.id === generationId ? { ...gen, src: imageUrl, status: 'done' } : gen
        ));
        
        setActiveGenerationId(generationId);
        
        if (activeView !== 'creations' && !isSidebarOpen) {
            setNewHistoryNotification(true);
        }

        setGenerationStacks(prevStacks => {
            const currentStack = prevStacks[featureKey];
            const newImages = [...currentStack.images.slice(0, currentStack.currentIndex + 1), imageUrl];
            return {
                ...prevStacks,
                [featureKey]: {
                    images: newImages,
                    currentIndex: newImages.length - 1,
                }
            };
        });
    };

    const handleUndo = () => {
        const featureKey = getCurrentFeatureKey;
        setGenerationStacks(prev => {
            const stack = prev[featureKey];
            if (stack.currentIndex > 0) { // Keep at least one image if possible
                return { ...prev, [featureKey]: { ...stack, currentIndex: stack.currentIndex - 1 } };
            } else if (stack.currentIndex === 0) {
                 return { ...prev, [featureKey]: { ...stack, currentIndex: -1 } };
            }
            return prev;
        });
    };
    
    const handleRedo = () => {
        const featureKey = getCurrentFeatureKey;
        setGenerationStacks(prev => {
            const stack = prev[featureKey];
            if (stack.currentIndex < stack.images.length - 1) {
                return { ...prev, [featureKey]: { ...stack, currentIndex: stack.currentIndex + 1 } };
            }
            return prev;
        });
    };

    const handleStartOver = () => {
        setMode('background');
        setBackgroundSubMode('color');
        setModelSource('ai');
        setActiveView('dashboard');
        setProductImage(initialProductImage);
        setFeatureStates(initialFeatureStates);
        setGenerationStacks(initialGenerationStacks);
        setSessionGenerations([]);
        
        setBackgroundStatuses(initialBackgroundStatuses);
        setAiModelStatuses(initialAiModelStatuses);
        setIsScenePromptLoading(false);
        setIsAiModelPromptLoading(initialAiModelPromptLoading);

        setUploadKey(k => k + 1);
        setActiveGenerationId(null);
        setDetailedCreation(null);
    };
    
    const currentStack = generationStacks[getCurrentFeatureKey];
    const canUndo = currentStack && currentStack.currentIndex >= 0;
    const canRedo = currentStack && currentStack.currentIndex < currentStack.images.length - 1;

    // --- CONTEXT-AWARE DISPLAY HANDLERS ---
    const handleSetMode = (newMode: Mode) => {
        if (mode !== newMode) {
            setMode(newMode);
        }
    };

    const handleSetBackgroundSubMode = (newSubMode: BackgroundSubMode) => {
        if (backgroundSubMode !== newSubMode) {
            setBackgroundSubMode(newSubMode);
        }
    };

    const handleSetModelSource = (newSource: ModelSource) => {
        if (modelSource !== newSource) {
            setModelSource(newSource);
        }
    };

    // --- EVENT HANDLERS ---
    const handleDownload = (src: string) => {
        const blob = dataURLtoBlob(src);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        const extension = getFileExtensionFromDataUrl(src);
        link.download = `blendify-ai-${Date.now()}.${extension}`;
        
        document.body.appendChild(link);
        link.click();
        
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleDeleteFromHistory = (idToDelete: number) => {
        setSessionGenerations(prev => prev.filter(gen => gen.id !== idToDelete));
        if (activeGenerationId === idToDelete) {
            setActiveGenerationId(null);
        }
        if (detailedCreation?.id === idToDelete) {
            setDetailedCreation(null);
            // On desktop, this will cause a flicker before the onBack call. Better to handle navigation in the component.
        }
    };
    
    const handleFileUpload = (file: File, imageType: 'product' | 'model') => {
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const url = event.target?.result as string;
                const img = new Image();
                img.onload = () => {
                    if (mode === 'background') {
                        const isTransparent = backgroundSubMode === 'color' && featureStates['background-color']?.backgroundColor === 'transparent';
                        const effectiveSubMode = isTransparent ? 'transparent' : backgroundSubMode;
                        setBackgroundStatuses(s => ({ ...s, [effectiveSubMode]: { ...s[effectiveSubMode], error: null } }));
                    }
                    if (mode === 'ai-model') {
                        setAiModelStatuses(s => ({ ...s, [modelSource]: { ...s[modelSource], error: null } }));
                    }

                    const imageData = { url, file, originalWidth: img.naturalWidth, originalHeight: img.naturalHeight };
                    if (imageType === 'product') {
                        setProductImage(imageData);
                        setGenerationStacks(initialGenerationStacks);
                        setActiveGenerationId(null);
                    } else { // model
                        updateCurrentFeatureState({ modelImage: imageData });
                    }
                };
                img.src = url;
            };
            reader.readAsDataURL(file);
        }
    };

    const handlePromptGen = async () => {
        // --- START: CONTEXT CAPTURE ---
        // Capture the state at the moment the function is called.
        // This is crucial to prevent race conditions if the user changes modes while the async operation is in flight.
        const invokedMode = mode;
        const invokedModelSource = modelSource;
        const featureKeyForPromptGen: keyof GenerationStacks = invokedMode === 'background' ? 'background-scene' : `ai-model-${invokedModelSource}`;
        const settingsForPromptGen = { ...defaultFeatureSettings, ...featureStates[featureKeyForPromptGen] };
        // --- END: CONTEXT CAPTURE ---
    
        try {
            if (invokedMode === 'background') {
                if (!productImage.url || isScenePromptLoading) return;
                setIsScenePromptLoading(true);
                setBackgroundStatuses(prev => ({...prev, scene: { ...prev.scene, error: null }}));
                const { preparedDataUrl } = await prepareImage(productImage.url);
                const suggestion = await generatePromptSuggestion(preparedDataUrl, 'background');
    
                // Update the specific feature's state, not the "current" one.
                setFeatureStates(prev => ({
                    ...prev,
                    [featureKeyForPromptGen]: { ...(prev[featureKeyForPromptGen] ?? {}), scenePrompt: suggestion }
                }));
    
            } else if (invokedMode === 'ai-model') {
                if (isAiModelPromptLoading[invokedModelSource]) return;
                if (invokedModelSource === 'ai' && !productImage.url) return;
                if (invokedModelSource === 'custom' && !settingsForPromptGen.modelImage.url) return;
                
                setIsAiModelPromptLoading(prev => ({...prev, [invokedModelSource]: true}));
                setAiModelStatuses(prev => ({ ...prev, [invokedModelSource]: { ...prev[invokedModelSource], error: null }}));
    
                const { preparedDataUrl: preparedProductUrl } = await prepareImage(productImage.url!);
                let preparedModelUrl: string | undefined = undefined;
                if (invokedModelSource === 'custom' && settingsForPromptGen.modelImage.url) {
                    const { preparedDataUrl } = await prepareImage(settingsForPromptGen.modelImage.url);
                    preparedModelUrl = preparedDataUrl;
                }
                const suggestion = await generatePromptSuggestion(preparedProductUrl, 'ai-model', preparedModelUrl);
                
                // Update the specific feature's state, not the "current" one.
                if (invokedModelSource === 'ai') {
                    setFeatureStates(prev => ({
                        ...prev,
                        [featureKeyForPromptGen]: { ...(prev[featureKeyForPromptGen] ?? {}), aiGeneratedPrompt: suggestion }
                    }));
                } else {
                    setFeatureStates(prev => ({
                        ...prev,
                        [featureKeyForPromptGen]: { ...(prev[featureKeyForPromptGen] ?? {}), yourModelPrompt: suggestion }
                    }));
                }
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to generate prompt.';
            if (invokedMode === 'background') {
                setBackgroundStatuses(prev => ({...prev, scene: { isLoading: '', error: errorMsg }}));
            }
            if (invokedMode === 'ai-model') {
                setAiModelStatuses(prev => ({...prev, [invokedModelSource]: { isLoading: '', error: errorMsg }}));
            }
        } finally {
            if (invokedMode === 'background') {
                setIsScenePromptLoading(false);
            }
            if (invokedMode === 'ai-model') {
                setIsAiModelPromptLoading(prev => ({...prev, [invokedModelSource]: false}));
            }
        }
    };
    
    const handleBackgroundGenerate = async () => {
        if (!productImage.url) return;

        const isTransparentRequest = backgroundSubMode === 'color' && featureStates['background-color']?.backgroundColor === 'transparent';
        const effectiveSubMode: ServiceBackgroundSubMode = isTransparentRequest ? 'transparent' : backgroundSubMode;
        const featureKey: keyof GenerationStacks = `background-${effectiveSubMode}`;

        if (backgroundStatuses[effectiveSubMode].isLoading) return;

        const snapshot: GenerationStateSnapshot = {
            mode,
            backgroundSubMode,
            modelSource,
            productImageUrl: productImage.url,
            featureStates,
        };

        const newId = generationIdCounter.current++;
        setSessionGenerations(prev => [{ id: newId, src: null, status: 'loading', featureKey, snapshot }, ...prev]);
        setActiveGenerationId(newId);

        setBackgroundStatuses(prev => ({ ...prev, [effectiveSubMode]: { isLoading: 'Generating...', error: null }}));
        
        const currentSettings = { ...defaultFeatureSettings, ...featureStates[featureKey]};

        const subModeSettings = 
            effectiveSubMode === 'color' ? { backgroundColor: currentSettings.backgroundColor } :
            effectiveSubMode === 'scene' ? { scenePrompt: currentSettings.scenePrompt } :
            {};

        const settings = { 
            promptOptimizer: currentSettings.promptEnhancer,
            backgroundSubMode: effectiveSubMode,
            aspectRatio: currentSettings.aspectRatio,
            ...subModeSettings,
        };

        try {
            const { preparedDataUrl } = await prepareImage(productImage.url, 1024);
            
            const result = await generateProductShot(preparedDataUrl, settings);
            
            let finalImage = result;
            if (effectiveSubMode === 'transparent') {
                finalImage = await cropImage(result, productImage.originalWidth, productImage.originalHeight);
            }

            recordNewGeneration(finalImage, newId, featureKey);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'An unknown error occurred.';
            setBackgroundStatuses(prev => ({ ...prev, [effectiveSubMode]: { isLoading: '', error: errorMsg }}));
            setSessionGenerations(prev => prev.filter(gen => gen.id !== newId));
            setActiveGenerationId(null);
        } finally {
            setBackgroundStatuses(prev => ({ ...prev, [effectiveSubMode]: { ...prev[effectiveSubMode], isLoading: '' }}));
        }
    };
    
    const handleAiModelGenerate = async () => {
        const invokedModelSource = modelSource;
        const featureKey: keyof GenerationStacks = `ai-model-${invokedModelSource}`;

        if (aiModelStatuses[invokedModelSource].isLoading) return;

        const snapshot: GenerationStateSnapshot = {
            mode,
            backgroundSubMode,
            modelSource,
            productImageUrl: productImage.url,
            featureStates,
        };

        const newId = generationIdCounter.current++;
        setSessionGenerations(prev => [{ id: newId, src: null, status: 'loading', featureKey, snapshot }, ...prev]);
        setActiveGenerationId(newId);

        const currentSettings = { ...defaultFeatureSettings, ...featureStates[featureKey]};
        const currentPrompt = invokedModelSource === 'ai' ? currentSettings.aiGeneratedPrompt : currentSettings.yourModelPrompt;

        setAiModelStatuses(prev => ({ ...prev, [invokedModelSource]: { isLoading: 'Generating...', error: null }}));

        try {
            let productUrlForApi: string | null = productImage.url;
            let modelUrlForApi: string | null = null;

            if (productUrlForApi) {
                const { preparedDataUrl } = await prepareImage(productUrlForApi, 1024);
                productUrlForApi = preparedDataUrl;
            }

            if (invokedModelSource === 'custom' && currentSettings.modelImage.url) {
                const { preparedDataUrl } = await prepareImage(currentSettings.modelImage.url, 1024);
                modelUrlForApi = preparedDataUrl;
            }
            
            const result = await generateAiModelShot(currentPrompt, currentSettings.promptBuilder, productUrlForApi, currentSettings.gender, currentSettings.promptEnhancer, modelUrlForApi, currentSettings.aspectRatio);
            
            recordNewGeneration(result, newId, featureKey);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'An unknown error occurred.';
            setAiModelStatuses(prev => ({ ...prev, [invokedModelSource]: { isLoading: '', error: errorMsg }}));
            setSessionGenerations(prev => prev.filter(gen => gen.id !== newId));
            setActiveGenerationId(null);
        } finally {
            setAiModelStatuses(prev => ({ ...prev, [invokedModelSource]: { ...prev[invokedModelSource], isLoading: '' }}));
        }
    };

    const handleGenerateClick = () => {
        if (mode === 'background') {
            handleBackgroundGenerate();
        } else if (mode === 'ai-model') {
            handleAiModelGenerate();
        }
    };
    
    const currentStatus = useMemo(() => {
        if (mode === 'background') {
            const isTransparent = backgroundSubMode === 'color' && featureStates['background-color']?.backgroundColor === 'transparent';
            const effectiveSubMode = isTransparent ? 'transparent' : backgroundSubMode;
            return backgroundStatuses[effectiveSubMode];
        }
        if (mode === 'ai-model') return aiModelStatuses[modelSource];
        return initialOpStatus;
    }, [mode, backgroundSubMode, modelSource, featureStates, backgroundStatuses, aiModelStatuses]);
    
    const canGenerate = useMemo(() => {
        if (currentStatus.isLoading) return false;
        
        if (mode === 'background' && productImage.url) return true;
        if (mode === 'ai-model') {
            if (modelSource === 'ai') return !!(productImage.url && currentFeatureState.aiGeneratedPrompt);
            if (modelSource === 'custom') return !!(productImage.url && currentFeatureState.modelImage.url && currentFeatureState.yourModelPrompt);
        }
        return false;
    }, [currentStatus.isLoading, productImage, currentFeatureState, mode, modelSource]);

    const canvasDisplayUrl = useMemo(() => {
        const stack = generationStacks[getCurrentFeatureKey];
        if (stack && stack.currentIndex >= 0) {
            return stack.images[stack.currentIndex];
        }
        return null;
    }, [getCurrentFeatureKey, generationStacks]);

    // This effect syncs the active history item with the image on the canvas when in the dashboard view.
    useEffect(() => {
        if (activeView !== 'dashboard') return;
        
        const urlOnCanvas = canvasDisplayUrl;

        if (!urlOnCanvas) {
            const loadingGen = sessionGenerations.find(g => g.featureKey === getCurrentFeatureKey && g.status === 'loading');
            setActiveGenerationId(loadingGen ? loadingGen.id : null);
            return;
        }
        
        const matchingGeneration = sessionGenerations.find(gen => gen.src === urlOnCanvas);
        if (matchingGeneration && activeGenerationId !== matchingGeneration.id) {
            setActiveGenerationId(matchingGeneration.id);
        }
    }, [canvasDisplayUrl, sessionGenerations, getCurrentFeatureKey, activeGenerationId, activeView]);

    const handleViewCreationDetail = (id: number) => {
        const generation = sessionGenerations.find(gen => gen.id === id);
        if (!generation || !generation.src || generation.status !== 'done') return;
    
        setDetailedCreation(generation);
        setActiveView('creation-detail');
    };
    
    const settingsPanelProps = {
        mode, handleSetMode, 
        backgroundSubMode, handleSetBackgroundSubMode,
        uploadKey, handleFileUpload, 
        productImage: { url: productImage.url },
        colorSwatches,
        modelSource, handleSetModelSource, 
        isAiModelPromptLoading, isScenePromptLoading, handlePromptGen,
        backgroundStatuses, aiModelStatuses,
        featureState: currentFeatureState,
        onFeatureStateChange: updateCurrentFeatureState,
    };
    
    const canvasViewProps = {
        currentStatus, canvasDisplayUrl, handleDownload, 
        productImage: { url: productImage.url },
        mode,
        canUndo,
        canRedo,
        onUndo: handleUndo,
        onRedo: handleRedo,
        onStartOver: handleStartOver,
    };
    
    const NavButton = ({ icon: Icon, label, isActive, onClick, isDisabled = false, hasNotification = false }: any) => (
        <button 
            onClick={onClick} 
            disabled={isDisabled}
            className={`w-full flex flex-col items-center p-3 rounded-xl transition-colors relative group ${isActive ? 'bg-neutral-800' : 'text-neutral-400 hover:bg-neutral-800/50'} ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            aria-label={label}
        >
            <div className="relative">
                 <Icon className={`w-7 h-7 transition-colors ${isActive ? 'text-yellow-400' : 'group-hover:text-white'}`} />
                 {hasNotification && <span className="absolute -top-0.5 -right-0.5 block h-2.5 w-2.5 rounded-full bg-yellow-400 ring-2 ring-neutral-900"></span>}
            </div>
            <span className={`text-xs mt-1.5 font-bold transition-colors ${isActive ? 'text-yellow-400' : 'group-hover:text-white'}`}>{label}</span>
        </button>
    );

    return (
        <div className="bg-neutral-900 text-white h-screen flex font-roboto overflow-hidden">
            {/* --- NEW SIDE PANEL (Desktop) --- */}
            <aside className="hidden lg:flex flex-col w-24 flex-shrink-0 bg-neutral-900 border-r border-white/10 p-3">
                <div className="p-2 mb-6">
                    <LogoIcon className="w-8 h-8 mx-auto text-neutral-400"/>
                </div>
                <div className="flex-grow flex flex-col justify-center items-center space-y-2">
                    <NavButton 
                        label="Studio"
                        icon={StudioIcon}
                        isActive={activeView === 'dashboard'}
                        onClick={() => setActiveView('dashboard')}
                    />
                    <NavButton 
                        label="Creations"
                        icon={CreationsIcon}
                        isActive={activeView === 'creations'}
                        onClick={() => { setActiveView('creations'); setNewHistoryNotification(false); }}
                        hasNotification={newHistoryNotification}
                    />
                </div>
                <div className="w-full space-y-4">
                    <UpgradeCard credits={3} onUpgrade={() => {}} isDesktop />
                    <button className="w-full p-3 bg-stone-800 text-neutral-200 rounded-xl flex flex-col items-center text-sm font-bold hover:bg-stone-700 transition-colors">
                        <SignInIcon className="w-6 h-6" />
                        <span className="mt-1 text-xs">Sign In</span>
                    </button>
                </div>
            </aside>
            
            {/* --- MAIN CONTENT AREA --- */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* --- DESKTOP LAYOUT --- */}
                <div className="hidden lg:flex flex-1 flex-row overflow-hidden">
                   {activeView === 'dashboard' && (
                       <>
                         <main className="flex-1 flex flex-col items-center justify-center studio-background p-8 relative">
                            <div className="w-full h-full">
                                <CanvasView {...canvasViewProps} />
                            </div>
                        </main>
                        <aside className="w-96 flex-shrink-0 bg-black/20 flex flex-col">
                            <div className="flex-grow overflow-y-auto p-4">
                               <SettingsPanelContent {...settingsPanelProps}/>
                            </div>
                            
                            <div className="p-4 flex-shrink-0 bg-gradient-to-t from-neutral-900">
                                <button onClick={handleGenerateClick} disabled={!canGenerate} className={primaryButtonClasses + ' w-full'}>
                                    {currentStatus.isLoading ? 'Generating...' : 'Generate'}
                                </button>
                            </div>
                        </aside>
                       </>
                   )}
                   {activeView === 'creations' && (
                        <main className="flex-1 studio-background overflow-y-auto p-8 flex flex-col">
                           {sessionGenerations.length > 0 && (
                                <div className="mb-8 flex-shrink-0">
                                    <h1 className="text-4xl lg:text-5xl font-bold text-neutral-100 tracking-tighter">My Creations</h1>
                                    <p className="text-neutral-400 mt-2 text-base lg:text-lg max-w-md">Your personal gallery of generated images. Review, download, or delete your creations.</p>
                                </div>
                            )}
                            <div className={sessionGenerations.length === 0 ? 'flex-grow' : ''}>
                                <CreationsGallery 
                                    sessionGenerations={sessionGenerations} 
                                    onViewDetails={handleViewCreationDetail}
                                    onGoToStudio={() => setActiveView('dashboard')}
                                />
                            </div>
                        </main>
                   )}
                   {activeView === 'creation-detail' && detailedCreation && (
                       <CreationDetailView 
                        creation={detailedCreation}
                        onBack={() => setActiveView('creations')}
                        onDownload={handleDownload}
                        onDelete={handleDeleteFromHistory}
                       />
                   )}
                </div>

                {/* --- MOBILE / TABLET LAYOUT --- */}
                <div className="lg:hidden flex flex-col h-full bg-neutral-900">
                   {activeView === 'creation-detail' && detailedCreation ? (
                        <MobileCreationDetailView
                            creation={detailedCreation}
                            onBack={() => {
                                setDetailedCreation(null);
                                setActiveView('creations');
                            }}
                            onDownload={handleDownload}
                            onDelete={handleDeleteFromHistory}
                        />
                    ) : (
                        <>
                            <MobileHeader onMenuClick={() => setIsSidebarOpen(true)} />
                            <MobileSidebar 
                                isOpen={isSidebarOpen}
                                onClose={() => setIsSidebarOpen(false)}
                                activeView={activeView}
                                setActiveView={setActiveView}
                                newHistoryNotification={newHistoryNotification}
                                setNewHistoryNotification={setNewHistoryNotification}
                            />
                            <main className="flex-1 overflow-y-auto pt-16">
                               {activeView === 'dashboard' && (
                                   <div className="p-4 pb-24 space-y-4">
                                        <div className="w-full aspect-square studio-background rounded-3xl">
                                            <CanvasView {...canvasViewProps} />
                                        </div>
                                        <SettingsPanelContent {...settingsPanelProps} />
                                    </div>
                               )}
                               {activeView === 'creations' && (
                                   <div className="p-4 pb-20 pt-4 h-full flex flex-col">
                                       {sessionGenerations.length > 0 && (
                                           <div className="mb-4 flex-shrink-0">
                                               <h1 className="text-3xl font-bold tracking-tight text-neutral-100">My Creations</h1>
                                               <p className="text-neutral-400 mt-1 text-sm">Browse and manage your generated images.</p>
                                           </div>
                                        )}
                                        <div className={sessionGenerations.length === 0 ? 'flex-grow' : ''}>
                                            <CreationsGallery 
                                                sessionGenerations={sessionGenerations} 
                                                onViewDetails={handleViewCreationDetail}
                                                onGoToStudio={() => {
                                                    setActiveView('dashboard');
                                                    setIsSidebarOpen(false);
                                                }}
                                            />
                                        </div>
                                   </div>
                               )}
                            </main>

                            <div className="p-4 flex-shrink-0 bg-gradient-to-t from-neutral-900 fixed bottom-0 left-0 right-0 z-20 pointer-events-none">
                                {activeView === 'dashboard' && (
                                    <motion.div
                                      initial={{ y: 20, opacity: 0 }}
                                      animate={{ y: 0, opacity: 1 }}
                                      className="pointer-events-auto"
                                    >
                                        <button onClick={handleGenerateClick} disabled={!canGenerate} className={primaryButtonClasses + ' w-full'}>
                                            {currentStatus.isLoading ? 'Generating...' : 'Generate'}
                                        </button>
                                    </motion.div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}