import { setIcon, Setting } from "obsidian";
import { Chesser } from "./Chesser";

function createToolbar(containerEl: HTMLElement, chesser: Chesser) {
  const btnContainer = containerEl.createDiv("chess-toolbar-container");
  btnContainer.createEl("a", "view-action", (btn: HTMLAnchorElement) => {
    btn.ariaLabel = "Flip board";
    setIcon(btn, "switch");
    btn.addEventListener("click", (e: MouseEvent) => {
      e.preventDefault();
      chesser.flipBoard();
    });
  });

  btnContainer.createEl("a", "view-action", (btn: HTMLAnchorElement) => {
    btn.ariaLabel = "Reset";
    setIcon(btn, "restore-file-glyph");
    btn.addEventListener("click", (e: MouseEvent) => {
      e.preventDefault();
      while (chesser.history().length > 0) {
        chesser.undo_move();
      }
    });
  });

  btnContainer.createEl("a", "view-action", (btn: HTMLAnchorElement) => {
    btn.ariaLabel = "Undo";
    setIcon(btn, "left-arrow");
    btn.addEventListener("click", (e: MouseEvent) => {
      e.preventDefault();
      chesser.undo_move();
    });
  });

  btnContainer.createEl("a", "view-action", (btn: HTMLAnchorElement) => {
    btn.ariaLabel = "Redo";
    setIcon(btn, "right-arrow");
    btn.addEventListener("click", (e: MouseEvent) => {
      e.preventDefault();
      chesser.redo_move();
    });
  });

  btnContainer.createEl("a", "view-action", (btn: HTMLAnchorElement) => {
    btn.ariaLabel = "Copy FEN";
    setIcon(btn, "two-blank-pages");
    btn.addEventListener("click", (e: MouseEvent) => {
      e.preventDefault();
      chesser.undo_move();
    });
  });
}

export function createMenu(parentEl: HTMLElement, chesser: Chesser) {
  return parentEl.createDiv("chess-menu-container", (containerEl) => {
    containerEl;
    containerEl.createDiv({ cls: "chess-menu-section" }, (sectionEl) => {
      sectionEl.createEl(
        "select",
        { cls: "dropdown chess-starting-position-dropdown" },
        (el) => {
          el.createEl("option", {
            value: "starting-position",
            text: "Starting Position",
          });
          el.createEl("optgroup", {}, (optgroup) => {
            optgroup.label = "Popular Openings";
            optgroup.createEl("option", {
              value: "b00",
              text: "B00 King's Pawn",
            });
          });
        }
      );

      new Setting(sectionEl).setName("Enable Free Move?").addToggle((toggle) => {
        toggle.setValue(chesser.getBoardState().movable.free);
        toggle.onChange((value) => {
          chesser.setFreeMove(!value);
        });
      });
    });

    containerEl.createDiv(
      { cls: "chess-menu-section chess-menu-section-tall" },
      (sectionEl) => {
        sectionEl.createDiv({
          text: chesser.turn() === "b" ? "Black's turn" : "White's turn",
          cls: "chess-turn-text",
        });
        sectionEl.createDiv("chess-move-list", (moveListEl) => {
          chesser.history().forEach((move, idx) => {
            moveListEl.createDiv({
              cls: `chess-move ${
                chesser.currentMoveIdx === idx ? "chess-move-active" : ""
              }`,
              text: move.san,
            });
          });
        });
      }
    );

    createToolbar(containerEl, chesser);
  });
}
