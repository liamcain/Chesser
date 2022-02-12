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
import { Chess, ChessInstance, Square } from "chess.js";
import { Chessground } from "chessground";
import { Api } from "chessground/api";
import { Color, Key } from "chessground/types";
import { DrawShape } from "chessground/draw";

import { ChesserConfig, parse_user_config } from "./ChesserConfig";
import { ChesserSettings } from "./ChesserSettings";
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
import { Config } from "chessground/config";

export function draw_chessboard(app: App, settings: ChesserSettings) {
  return (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    let user_config = parse_user_config(settings, source);
    ctx.addChild(new Chesser(el, ctx, user_config, app));
  };
}

export class Chesser extends MarkdownRenderChild {
  private ctx: MarkdownPostProcessorContext;
  private app: App;

  private cg: Api;
  private chess: ChessInstance;

  constructor(
    containerEl: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    user_config: ChesserConfig,
    app: App
  ) {
    super(containerEl);

    this.app = app;
    this.ctx = ctx;
    this.sync_board_with_gamestate = this.sync_board_with_gamestate.bind(this);
    this.save_move = this.save_move.bind(this);
    this.save_shapes = this.save_shapes.bind(this);

    this.chess = new Chess();
    if (user_config.pgn) {
      this.chess.load_pgn(user_config.pgn, { sloppy: true });
    } else if (user_config.fen) {
      this.chess.load(user_config.fen);
    }

    // const history = this.chess.history({ verbose: true });
    // const lastMove = history.length > 0 ? history[history.length - 1] : undefined;
    this.set_style(containerEl, user_config.pieceStyle, user_config.boardStyle);
    try {
      this.cg = Chessground(containerEl.createDiv(), {
        fen: this.chess.fen(),
        addDimensionsCssVars: true,
        orientation: user_config.orientation as Color,
        viewOnly: user_config.viewOnly,
        drawable: {
          enabled: user_config.drawable,
          onChange: this.save_shapes,
        },
      });
    } catch (e) {
      new Notice("Chesser error: Invalid config");
      console.error(e);
      return;
    }

    createMenu(containerEl, this);

    // Activates the chess logic
    if (user_config.free) {
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
            this.chess.move({ from: orig, to: dest });
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
  }

  set_style(el: HTMLElement, pieceStyle: string, boardStyle: string) {
    el.addClasses([pieceStyle, `${boardStyle}-board`, "chesser-container"]);
  }

  color_turn(): Color {
    return this.chess.turn() === "w" ? "white" : "black";
  }

  dests(): Map<Key, Key[]> {
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

  check(): boolean {
    return this.chess.in_check();
  }

  get_section_range(view: MarkdownView): [EditorPosition, EditorPosition] {
    const sectionInfo = this.ctx.getSectionInfo(this.containerEl);
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

  get_config(view: MarkdownView): ChesserConfig | undefined {
    const [from, to] = this.get_section_range(view);
    const codeblockText = view.editor.getRange(from, to);
    try {
      return parseYaml(codeblockText);
    } catch (e) {
      // failed to parse. show error...
    }

    return undefined;
  }

  save_move() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      throw new Error("Failed to retrieve view");
    }
    try {
      const updated = stringifyYaml({
        ...this.get_config(view),
        pgn: this.chess.pgn(),
      });

      const [from, to] = this.get_section_range(view);
      view.editor.replaceRange(updated, from, to);
    } catch (e) {
      // failed to parse. show error...
    }
  }

  save_shapes(shapes: DrawShape[]) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      throw new Error("Failed to retrieve view");
    }

    try {
      const updated = stringifyYaml({
        ...this.get_config(view),
        shapes,
      });

      const [from, to] = this.get_section_range(view);
      view.editor.replaceRange(updated, from, to);
    } catch (e) {
      // failed to parse. show error...
    }
  }

  sync_board_with_gamestate() {
    this.cg.set({
      check: this.check(),
      turnColor: this.color_turn(),
      movable: {
        color: this.color_turn(),
        dests: this.dests(),
      },
    });

    this.save_move();
  }

  public undo_move() {
    console.log("BEFORE: ", this.chess.fen());
    if (this.history().length === 0) {
      return;
    }

    this.chess.undo();
    console.log("AFTER: ", this.chess.fen());
    this.cg.set({ fen: this.chess.fen() });
    // this.sync_board_with_gamestate();
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
    return this.chess.history({ verbose: true });
  }

  public flipBoard() {
    return this.cg.toggleOrientation();
  }

  public getBoardState() {
    return this.cg.state;
  }
}
