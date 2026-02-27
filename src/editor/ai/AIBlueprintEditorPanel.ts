// ============================================================
//  AIBlueprintEditorPanel — wrapper around the existing NodeEditorPanel
//  that mounts pre-populated blueprint graphs for AI asset types:
//    - BTTask: AI Receive Execute, Tick, Abort pre-placed
//    - BTDecorator: AI Perform Condition Check, Observer events
//    - BTService: Service Activated, Tick, Deactivated events
//    - AIController: On Possess, Unpossess, Move Completed, Perception Updated
// ============================================================

import {
  type AIAssetManager,
  type BTTaskAsset,
  type BTDecoratorAsset,
  type BTServiceAsset,
  type AIControllerAsset,
} from './AIAssetManager';
import { mountNodeEditorForAsset } from '../NodeEditorPanel';
import { BlueprintData } from '../BlueprintData';
import { iconHTML, Icons, ICON_COLORS } from '../icons';

export type AIBlueprintType = 'btTask' | 'btDecorator' | 'btService' | 'aiController';

interface AIBlueprintConfig {
  type: AIBlueprintType;
  hintKey: string;
  hintText: string;
  icon: any[];
  iconColor: string;
}

const CONFIGS: Record<AIBlueprintType, AIBlueprintConfig> = {
  btTask: {
    type: 'btTask',
    hintKey: 'btTask',
    hintText: 'Wire your logic between AI Receive Execute and Finish Execute. Call Finish Execute with Success=true when your Task completes successfully.',
    icon: Icons.Zap,
    iconColor: '#E65100',
  },
  btDecorator: {
    type: 'btDecorator',
    hintKey: 'btDecorator',
    hintText: 'Return true from AI Perform Condition Check to allow the branch to run. Use Observer events for active monitoring.',
    icon: Icons.Diamond,
    iconColor: '#7B1FA2',
  },
  btService: {
    type: 'btService',
    hintKey: 'btService',
    hintText: 'Services tick at a configurable interval while their parent node is active. Use AI Service Tick to update blackboard values.',
    icon: Icons.Settings,
    iconColor: '#546E7A',
  },
  aiController: {
    type: 'aiController',
    hintKey: 'aiController',
    hintText: 'On Possess is called when this controller takes control of a pawn. Use Run Behavior Tree to start your AI logic.',
    icon: Icons.Gamepad2,
    iconColor: '#00838F',
  },
};

export class AIBlueprintEditorPanel {
  private _container: HTMLElement;
  private _manager: AIAssetManager;
  private _cleanup: (() => void) | null = null;
  private _config: AIBlueprintConfig;

  constructor(
    container: HTMLElement,
    asset: BTTaskAsset | BTDecoratorAsset | BTServiceAsset | AIControllerAsset,
    type: AIBlueprintType,
    manager: AIAssetManager,
    onCompile?: (code: string) => void,
    onSave?: () => void,
  ) {
    this._container = container;
    this._manager = manager;
    this._config = CONFIGS[type];
    this._init(asset, type, onCompile);
  }

  private _init(
    asset: BTTaskAsset | BTDecoratorAsset | BTServiceAsset | AIControllerAsset,
    type: AIBlueprintType,
    onCompile?: (code: string) => void,
  ): void {
    this._container.innerHTML = '';
    this._container.className = 'ai-bp-editor';

    // ── Hint bar ──
    if (!this._manager.isHintDismissed(this._config.hintKey)) {
      const hint = document.createElement('div');
      hint.className = 'ai-hint-bar';
      hint.innerHTML = `
        <span class="ai-hint-icon">${iconHTML(Icons.Info, 12, '#fbbf24')}</span>
        <span>${this._config.hintText}</span>
        <button class="ai-hint-dismiss">Got it</button>
      `;
      hint.querySelector('.ai-hint-dismiss')!.addEventListener('click', () => {
        this._manager.dismissHint(this._config.hintKey);
        hint.remove();
      });
      this._container.appendChild(hint);
    }

    // ── Node editor wrapper ──
    const editorWrap = document.createElement('div');
    editorWrap.className = 'ai-bp-editor-wrap';
    this._container.appendChild(editorWrap);

    // Mount the Rete.js node editor using the asset's BlueprintData
    this._cleanup = mountNodeEditorForAsset(
      editorWrap,
      asset.blueprintData,
      asset.name,
      (code: string) => {
        (asset as any).compiledCode = code;
        (asset as any).modifiedAt = Date.now();
        onCompile?.(code);
      },
    );
  }

  dispose(): void {
    this._cleanup?.();
    this._container.innerHTML = '';
  }
}
