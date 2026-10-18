<h1>El Oso</h1>

An online implementation of the solitaire board game El Oso (also known as
"Rain"), designed by James Ernest and set in the world of Carrisor.

## How to Use

Play against the Bear. Your moves are deliberate; the Bear's moves are random.
Your goal is to move at least ten pieces off the top edge of the board and into
the Sky.

The kinds of moves you can make are:

- **Move**: Select one of your stacks and move it up to a number of spaces equal
  to its size. Stacks move diagonally or laterally, but never straight forward
  or straight back, and only through a straight and open path.
- **Move Off the Board**: Move a stack from the top row off the top of the board
  and into the Sky. Stacks can only enter the Sky from the top row.
- **Pass**: Move zero. You must still designate which stack "moved," as this
  affects the Bear's turn.

After each of your moves, the Bear rolls a number of dice equal to the height of
the stack that you moved, one die per column of the board:

- **Basic Result**: Move the Bear's stack in the indicated column one space
  towards the Ground.
- **Capture**: When a Bear's stack meets one of your stacks, pieces annihilate
  each other one by one. The Bear's pieces are removed to the Cave, yours to
  the Pit, from which they cannot return.
- **Empty Column**: If the indicated column has no Bear's pieces, a new Bear
  stack is added to the top row, using pieces from the Cave.
- **The Ground**: Bear stacks that move off the bottom of the board rain back
  onto the top row after the Bear's turn ends.

The game ends when your last piece leaves the board. Your score is the number of
pieces moved into the Sky: ten or more is a win, eleven and twelve are superior
wins, and nine or less is a loss.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/)

### Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Start the development server: `npm run dev`
4. Open http://localhost:8080 in your browser

Changes to the source files will be automatically reloaded in the browser.

### Testing

1. Run the test suite once: `npm run test`
2. Run the test suite in watch mode: `npm run test:watch`

### Building for Production

1. Remove the `dist` folder:
    - \*nix: `rm -rf dist`
    - Windows: `rmdir /s /q dist`
2. Build the project: `npm run build`
3. The production files will be in the `dist` folder

Production files can be served from any static file server.