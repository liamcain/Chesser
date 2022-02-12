import { nanoid } from "nanoid";
import {
  App,
  EditorPosition,
  MarkdownPostProcessorContext,
  MarkdownRenderChild,
  MarkdownView,
  Notice,
  parseYaml,
  stringifyYaml,
} from "obsidian";
import { Chess, ChessInstance, Move, Square } from "chess.js";
import { Chessground } from "chessground";
import { Api } from "chessground/api";
import { Color, Key } from "chessground/types";
import { DrawShape } from "chessground/draw";

import { ChesserConfig, parse_user_config } from "./ChesserConfig";
import { ChesserSettings, DEFAULT_SETTINGS } from "./ChesserSettings";
import { createMenu } from "./menu";

// To bundle all css files in styles.css with rollup
import "../assets/custom.css";
import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
// Piece styles
import "../assets/piece-css/alpha.css";
import "../assets/piece-css/california.css";
import "../assets/piece-css/cardinal.css";
import "../assets/piece-css/cburnett.css";
import "../assets/piece-css/chess7.css";
import "../assets/piece-css/chessnut.css";
import "../assets/piece-css/companion.css";
import "../assets/piece-css/dubrovny.css";
import "../assets/piece-css/fantasy.css";
import "../assets/piece-css/fresca.css";
import "../assets/piece-css/gioco.css";
import "../assets/piece-css/governor.css";
import "../assets/piece-css/horsey.css";
import "../assets/piece-css/icpieces.css";
import "../assets/piece-css/kosal.css";
import "../assets/piece-css/leipzig.css";
import "../assets/piece-css/letter.css";
import "../assets/piece-css/libra.css";
import "../assets/piece-css/maestro.css";
import "../assets/piece-css/merida.css";
import "../assets/piece-css/pirouetti.css";
import "../assets/piece-css/pixel.css";
import "../assets/piece-css/reillycraig.css";
import "../assets/piece-css/riohacha.css";
import "../assets/piece-css/shapes.css";
import "../assets/piece-css/spatial.css";
import "../assets/piece-css/staunty.css";
import "../assets/piece-css/tatiana.css";
// Board styles
import "../assets/board-css/brown.css";
import "../assets/board-css/blue.css";
import "../assets/board-css/green.css";
import "../assets/board-css/purple.css";
import "../assets/board-css/ic.css";

export function draw_chessboard(app: App, settings: ChesserSettings) {
  return (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    let user_config = parse_user_config(settings, source);
    ctx.addChild(new Chesser(el, ctx, user_config, app));
  };
}

function read_state(id: string) {
  const savedDataStr = localStorage.getItem(`chesser-${id}`);
  try {
    return JSON.parse(savedDataStr);
  } catch (err) {
    console.error(err);
  }
}

function write_state(id: string, game_state: ChesserConfig) {
  localStorage.setItem(`chesser-${id}`, JSON.stringify(game_state));
}

export class Chesser extends MarkdownRenderChild {
  private ctx: MarkdownPostProcessorContext;
  private app: App;

  private id: string;
  private cg: Api;
  private chess: ChessInstance;

  private menu: HTMLElement;
  private moves: Move[];

  public currentMoveIdx: number;

  constructor(
    containerEl: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    user_config: ChesserConfig,
    app: App
  ) {
    super(containerEl);

    this.app = app;
    this.ctx = ctx;
    this.id = user_config.id ?? nanoid(8);

    const saved_config = read_state(this.id);
    const config = Object.assign({}, user_config, saved_config);

    this.sync_board_with_gamestate = this.sync_board_with_gamestate.bind(this);
    this.save_move = this.save_move.bind(this);
    this.save_shapes = this.save_shapes.bind(this);

    // Save `id` into the codeblock yaml
    if (user_config.id === undefined) {
      this.app.workspace.onLayoutReady(() => {
        this.write_config({ id: this.id });
      });
    }

    this.chess = new Chess();
    if (config.pgn) {
      this.chess.load_pgn(config.pgn, { sloppy: true });
    } else if (config.fen) {
      this.chess.load(config.fen);
    }

    this.set_style(containerEl, config.pieceStyle, config.boardStyle);
    try {
      this.cg = Chessground(containerEl.createDiv(), {
        fen: this.chess.fen(),
        addDimensionsCssVars: true,
        orientation: config.orientation as Color,
        viewOnly: config.viewOnly,
        drawable: {
          enabled: config.drawable,
          onChange: this.save_shapes,
        },
      });
    } catch (e) {
      new Notice("Chesser error: Invalid config");
      console.error(e);
      return;
    }

    this.moves = this.chess.history({ verbose: true });
    this.currentMoveIdx = user_config.currentMoveIdx ?? this.moves.length - 1;

    // Activates the chess logic
    if (config.free) {
      this.cg.set({
        events: {
          move: this.save_move,
        },
        movable: {
          free: true,
        },
      });
    } else {
      this.cg.set({
        events: {
          move: (orig: any, dest: any) => {
            const move = this.chess.move({ from: orig, to: dest });
            this.moves.push(move);
            this.sync_board_with_gamestate();
          },
        },
        movable: {
          free: false,
          dests: this.dests(),
        },
      });
    }

    if (user_config.shapes) {
      this.cg.setShapes(user_config.shapes);
    }

    this.menu = createMenu(containerEl, this);
  }

  private set_style(el: HTMLElement, pieceStyle: string, boardStyle: string) {
    el.addClasses([pieceStyle, `${boardStyle}-board`, "chesser-container"]);
  }

  public color_turn(): Color {
    return this.chess.turn() === "w" ? "white" : "black";
  }

  public dests(): Map<Key, Key[]> {
    const dests = new Map();
    this.chess.SQUARES.forEach((s) => {
      const ms = this.chess.moves({ square: s, verbose: true });
      if (ms.length)
        dests.set(
          s,
          ms.map((m) => m.to)
        );
    });
    return dests;
  }

  public check(): boolean {
    return this.chess.in_check();
  }

  private get_section_range(view: MarkdownView): [EditorPosition, EditorPosition] {
    const sectionInfo = this.ctx.getSectionInfo(this.containerEl);
    console.log("this.ctx", sectionInfo);

    if (sectionInfo.lineStart) {
      return [
        {
          line: sectionInfo.lineStart + 1,
          ch: 0,
        },
        {
          line: sectionInfo.lineEnd,
          ch: 0,
        },
      ];
    }

    return [
      {
        line: sectionInfo.lineStart + 1,
        ch: 0,
      },
      {
        line: sectionInfo.lineEnd,
        ch: 0,
      },
    ];
  }

  private get_config(view: MarkdownView): ChesserConfig | undefined {
    const [from, to] = this.get_section_range(view);
    const codeblockText = view.editor.getRange(from, to);
    try {
      return parseYaml(codeblockText);
    } catch (e) {
      // failed to parse. show error...
    }

    return undefined;
  }

  private write_config(config: Partial<ChesserConfig>) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      throw new Error("Failed to retrieve view");
    }
    try {
      const updated = stringifyYaml({
        ...this.get_config(view),
        ...config,
      });

      const [from, to] = this.get_section_range(view);
      view.editor.replaceRange(updated, from, to);
    } catch (e) {
      // failed to parse. show error...
    }
  }

  private save_move() {
    const config = read_state(this.id);
    write_state(this.id, {
      ...config,
      pgn: this.chess.pgn(),
    });
  }

  private save_shapes(shapes: DrawShape[]) {
    const config = read_state(this.id);
    write_state(this.id, {
      ...config,
      shapes,
    });
  }

  private sync_board_with_gamestate() {
    this.cg.set({
      check: this.check(),
      turnColor: this.color_turn(),
      movable: {
        color: this.color_turn(),
        dests: this.dests(),
      },
    });

    this.menu.detach();
    this.menu = createMenu(this.containerEl, this);
    this.save_move();
  }

  public undo_move() {
    if (this.currentMoveIdx === 0) {
      return;
    }

    this.currentMoveIdx--;
    this.chess.undo();
    this.cg.set({ fen: this.chess.fen() });
    this.sync_board_with_gamestate();
  }

  public redo_move() {
    if (this.currentMoveIdx === this.moves.length - 1) {
      return;
    }

    this.currentMoveIdx++;
    const move = this.moves[this.currentMoveIdx];
    this.chess.move(move);

    this.cg.set({ fen: this.chess.fen() });
    this.sync_board_with_gamestate();
  }

  public setFreeMove(enabled: boolean): void {
    if (enabled) {
      this.cg.set({
        movable: {
          free: true,
          dests: undefined,
        },
      });
    } else {
      this.sync_board_with_gamestate();
    }
  }

  public turn() {
    return this.chess.turn();
  }

  public history() {
    return this.moves;
  }

  public flipBoard() {
    return this.cg.toggleOrientation();
  }

  public getBoardState() {
    return this.cg.state;
  }
}
