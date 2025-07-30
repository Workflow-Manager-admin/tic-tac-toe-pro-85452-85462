import React, { useState, useEffect, useCallback } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Link,
  useNavigate,
  useLocation,
} from "react-router-dom";
import "./App.css";

/**
 * ======== API INTEGRATION NOTES ========
 * This file integrates frontend with backend FastAPI endpoints.
 *   - All backend APIs are under /api on FastAPI server.
 *   - Auth endpoints use: /api/auth/register, /api/auth/login (POST).
 *   - JWT tokens are stored locally and included as Bearer in Authorization header.
 *   - Game creation, moves, leaderboard, and history APIs all require JWT.
 *   - Move, board, and user fields are mapped/normalized for backend responses.
 *   - CORS is configured as permissive in backend (allow_origins ["*"]), so frontend requests succeed in dev.
 *   - If deploying: be sure REACT_APP_BACKEND_URL points to correct server.
 */
// ======== API SETUP AND HELPERS ========

/**
 * API_BASE points to the backend FastAPI endpoint.
 * If deploying, set REACT_APP_BACKEND_URL in your .env, otherwise defaults to localhost:8000.
 */
export const API_BASE =
  process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";

/**
 * Unified API request function that manages content-type for JSON and auth headers.
 * Special logic: For login, uses form-urlencoded; other endpoints use JSON.
 */
async function apiRequest(endpoint, method = "GET", body, authToken = null, optionsOverride = {}) {
  const url = `${API_BASE}${endpoint}`;
  let headers = { ...optionsOverride.headers };
  let finalBody = null;
  let options = {
    method,
    headers,
    ...optionsOverride,
  };

  // For login (OAuth2PasswordRequestForm) handle form data.
  if (endpoint === "/api/auth/login" && method === "POST" && body && !optionsOverride.force_json) {
    // FastAPI expects 'application/x-www-form-urlencoded' for login.
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    finalBody = Object.entries(body)
      .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v))
      .join("&");
  } else if (body) {
    headers["Content-Type"] = "application/json";
    finalBody = JSON.stringify(body);
  }

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  if (finalBody) {
    options.body = finalBody;
  }

  options.headers = headers;

  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw { status: response.status, data: data || { message: "Unknown error" } };
  }
  return data;
}

// PUBLIC_INTERFACE
function useAuth() {
  // Auth state manager: JWT, profile, login/logout, auto-restore
  const [token, setToken] = useState(() => localStorage.getItem("jwt") || "");
  const [profile, setProfile] = useState(
    () => JSON.parse(localStorage.getItem("profile") || "null")
  );
  const [loading, setLoading] = useState(false);

  // Save token/profile in localStorage
  useEffect(() => {
    if (token) localStorage.setItem("jwt", token);
    else localStorage.removeItem("jwt");
  }, [token]);
  useEffect(() => {
    if (profile) localStorage.setItem("profile", JSON.stringify(profile));
    else localStorage.removeItem("profile");
  }, [profile]);

  // When token changes, decode payload to get username (no backend /users/me route exists).
  useEffect(() => {
    const loadProfileFromToken = async () => {
      if (token) {
        try {
          // JWT payload is { sub: username }
          const payload = JSON.parse(atob(token.split(".")[1]));
          setProfile({ username: payload.sub });
        } catch {
          setProfile(null);
        }
      }
    };
    loadProfileFromToken();
  }, [token]);

  // PUBLIC_INTERFACE
  const login = async (username, password) => {
    setLoading(true);
    try {
      // FastAPI expects "/api/auth/login" with username+password as form fields.
      const res = await apiRequest(
        "/api/auth/login",
        "POST",
        {
          username,
          password,
        },
        null, // no bearer token
        {} // options; default content-type handled in apiRequest
      );
      setToken(res.access_token);
      setProfile(null); // Triggers fetch in effect
      setLoading(false);
      return { success: true };
    } catch (err) {
      setLoading(false);
      return { success: false, error: err.data?.detail || "Login failed" };
    }
  };

  // PUBLIC_INTERFACE
  const register = async (username, password) => {
    setLoading(true);
    try {
      // Backend expects /api/auth/register POST with {username, password}
      await apiRequest(
        "/api/auth/register",
        "POST",
        { username, password }
      );
      setLoading(false);
      await login(username, password);
      return { success: true };
    } catch (err) {
      setLoading(false);
      return { success: false, error: err.data?.detail || "Registration failed" };
    }
  };

  // PUBLIC_INTERFACE
  const logout = () => {
    setToken("");
    setProfile(null);
  };

  return { token, profile, login, logout, register, loading, setToken };
}

// ======== STYLED COMPONENTS ========

// PUBLIC_INTERFACE
function Navbar({ user, logout }) {
  // Modern responsive navbar
  return (
    <nav className="navbar">
      <div className="navbar-left">
        <Link className="navbar-brand" to="/">
          <span role="img" aria-label="tic-tac-toe">❌⭕️</span> Tic Tac Toe Pro
        </Link>
        {user && (
          <>
            <Link to="/lobby" className="nav-link">Lobby</Link>
            <Link to="/leaderboard" className="nav-link">Leaderboard</Link>
            <Link to="/history" className="nav-link">History</Link>
          </>
        )}
      </div>
      <div className="navbar-right">
        {user ? (
          <>
            <span className="nav-user">Hi, {user.username}</span>
            <button className="btn btn-small" onClick={logout}>Logout</button>
          </>
        ) : (
          <>
            <Link to="/login" className="btn btn-small nav-btn">Login</Link>
            <Link to="/register" className="btn btn-small nav-btn">Register</Link>
          </>
        )}
      </div>
    </nav>
  );
}

// PUBLIC_INTERFACE
function ContainerMain({ children }) {
  return <main className="main-container">{children}</main>;
}

// ======== AUTH PAGES ========

function AuthPage({ mode, onSubmit, loading, error }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const isLogin = mode === "login";
  return (
    <div className="auth-container">
      <h2>{isLogin ? "Log In" : "Register"}</h2>
      <form
        className="auth-form"
        onSubmit={e => {
          e.preventDefault();
          onSubmit(username, password);
        }}
      >
        <input
          className="form-input"
          type="text"
          value={username}
          required
          minLength={3}
          placeholder="Username"
          onChange={e => setUsername(e.target.value)}
          autoFocus
        />
        <input
          className="form-input"
          type="password"
          value={password}
          required
          minLength={4}
          placeholder="Password"
          onChange={e => setPassword(e.target.value)}
        />
        <button className="btn btn-large" type="submit" disabled={loading}>
          {loading ? "Processing..." : isLogin ? "Login" : "Register"}
        </button>
      </form>
      {error && <div className="form-error">{error}</div>}
      {isLogin ? (
        <div className="form-switch">
          Don't have an account? <Link to="/register">Register</Link>
        </div>
      ) : (
        <div className="form-switch">
          Already have an account? <Link to="/login">Login</Link>
        </div>
      )}
    </div>
  );
}

function LoginPage({ auth }) {
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (username, password) => {
    const result = await auth.login(username, password);
    if (!result.success) {
      setError(result.error);
    } else {
      navigate("/lobby");
    }
  };
  return (
    <ContainerMain>
      <AuthPage mode="login" onSubmit={handleLogin} loading={auth.loading} error={error} />
    </ContainerMain>
  );
}

function RegisterPage({ auth }) {
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleRegister = async (username, password) => {
    const result = await auth.register(username, password);
    if (!result.success) {
      setError(result.error);
    } else {
      navigate("/lobby");
    }
  };
  return (
    <ContainerMain>
      <AuthPage mode="register" onSubmit={handleRegister} loading={auth.loading} error={error} />
    </ContainerMain>
  );
}

// ======== GAME LOGIC AND UI ========

// PUBLIC_INTERFACE
function TicTacToeBoard({ board, onMove, myMark, current, winner, disabled }) {
  // 3x3 grid
  const renderSquare = idx => (
    <button
      key={idx}
      className={`ttt-cell ${winner ? "ttt-cell-finish" : ""}${board[idx] ? " ttt-cell-filled" : ""}`}
      onClick={() => onMove(idx)}
      disabled={disabled || !!board[idx] || winner}
      aria-label={`Cell ${idx} ${board[idx] || ""}`}
    >
      <span className="ttt-symbol">{board[idx] || ""}</span>
    </button>
  );
  return (
    <div className="ttt-board-container">
      <div className="ttt-board-row">
        {renderSquare(0)}
        {renderSquare(1)}
        {renderSquare(2)}
      </div>
      <div className="ttt-board-row">
        {renderSquare(3)}
        {renderSquare(4)}
        {renderSquare(5)}
      </div>
      <div className="ttt-board-row">
        {renderSquare(6)}
        {renderSquare(7)}
        {renderSquare(8)}
      </div>
      {winner && (
        <div className="ttt-status ttt-winner">
          {winner === "draw" ? "Draw!" : `Winner: ${winner}`}
        </div>
      )}
      {!winner && (
        <div className="ttt-status">
          {myMark === current ? "Your move!" : "Waiting..."}
        </div>
      )}
    </div>
  );
}

// ======== LOBBY ========

// PUBLIC_INTERFACE
function LobbyPage({ auth, onOpenMatch }) {
  const [activeGames, setActiveGames] = useState([]);
  const [loading, setLoading] = useState(false);

  // There is no explicit "lobby" endpoint in backend, so list active multi games waiting for a second player.
  useEffect(() => {
    let running = true;
    async function pollLobby() {
      setLoading(true);
      try {
        // Filter games for type 'multi', active, and player_o is missing
        const res = await apiRequest("/api/history", "GET", null, auth.token);
        const myUsername = auth.profile?.username;
        // Filter for pending games available to join (not mine)
        const games = (res.games || [])
          .filter(
            g =>
              g.type === "multi" &&
              g.is_active &&
              (!g.player_o || !g.player_o.length) &&
              g.player_x !== myUsername
          )
          .map(g => ({
            id: g.id,
            host: g.player_x,
          }));
        if (running) setActiveGames(games);
      } catch {
        // ignore
      }
      setLoading(false);
    }
    pollLobby();
    const interval = setInterval(pollLobby, 4000);
    return () => {
      running = false;
      clearInterval(interval);
    };
  }, [auth.token, auth.profile]);

  // Start new game handler
  const handleNewGame = useCallback(
    async isMulti => {
      setLoading(true);
      try {
        // Backend: POST /api/game/new {type: 'single'|'multi'}
        const g = await apiRequest(
          "/api/game/new",
          "POST",
          { type: isMulti ? "multi" : "single" },
          auth.token
        );
        onOpenMatch(g.id);
      } catch (e) {
        alert("Unable to start game.");
      }
      setLoading(false);
    },
    [auth, onOpenMatch]
  );

  // Join game handler for multi: mark as "player_o" using game.new
  const handleJoin = async gameId => {
    setLoading(true);
    try {
      // To join, send /api/game/new with type: 'multi' (handled in backend by matching with open game)
      const g = await apiRequest(
        "/api/game/new",
        "POST",
        { type: "multi" },
        auth.token
      );
      onOpenMatch(g.id);
    } catch (e) {
      alert("Unable to join game.");
    }
    setLoading(false);
  };

  return (
    <ContainerMain>
      <h2>Game Lobby</h2>
      <div className="lobby-actions">
        <button className="btn btn-large" onClick={() => handleNewGame(false)}>New Single Player</button>
        <button className="btn btn-large" onClick={() => handleNewGame(true)}>New Multiplayer</button>
      </div>
      <h3>Active Multiplayer Games</h3>
      <div className="lobby-list">
        {loading && <div>Loading games...</div>}
        {!loading && activeGames.length === 0 && <div>No open games at the moment.</div>}
        {activeGames.map(g => (
          <div key={g.id} className="lobby-game-row">
            <span>Game #{g.id} - Host: <b>{g.host}</b></span>
            <button className="btn btn-small" onClick={() => handleJoin(g.id)}>
              Join
            </button>
          </div>
        ))}
      </div>
    </ContainerMain>
  );
}

// ======== GAME MATCH PAGE ========

// API responses assumed to be:
// GET /games/:id → {id, board, players: {X,Y}, turn, winner, moves, ...}

function GamePage({ auth, gameId, onLeave }) {
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [moveLoading, setMoveLoading] = useState(false);

  // Poll for game state (backend GET /api/game/{id})
  useEffect(() => {
    let running = true;
    async function pollGame() {
      setLoading(true);
      try {
        const data = await apiRequest(`/api/game/${gameId}`, "GET", null, auth.token);
        if (running) setGame(data);
      } catch (e) {
        // error
      }
      setLoading(false);
    }
    pollGame();
    const interval = setInterval(pollGame, 2000);
    return () => {
      running = false;
      clearInterval(interval);
    };
  }, [gameId, auth.token]);

  // Make move (backend expects {x, y})
  async function makeMove(idx) {
    setMoveLoading(true);
    try {
      // idx 0..8, map to (x, y)
      const x = Math.floor(idx / 3), y = idx % 3;
      await apiRequest(
        `/api/game/${gameId}/move`,
        "POST",
        { x, y },
        auth.token
      );
      // will update via poll
    } catch (e) {
      alert("Invalid move.");
    }
    setMoveLoading(false);
  }

  if (loading || !game) {
    return <ContainerMain><div>Loading match...</div></ContainerMain>;
  }

  // Backend response fields: id, type, player_x, player_o, winner, is_active, moves[]
  // Construct a [3x3] board array; winner is a username or null, not symbol
  const moves = (game.moves || []);
  const boardArr = Array(9).fill("");
  moves.forEach(m => {
    boardArr[m.x * 3 + m.y] = m.symbol;
  });

  // Determine which player am I
  const myName = auth.profile?.username;
  let myMark = null;
  if (game.player_x === myName) myMark = "X";
  if (game.player_o === myName) myMark = "O";
  const currentTurn = moves.length === 0 ? "X" : (moves[moves.length - 1].symbol === "X" ? "O" : "X");

  // Winner username (not symbol)
  let winnerDisplay = null;
  if (!game.is_active) {
    if (game.winner) {
      winnerDisplay = game.winner;
    } else {
      // If draw
      const filled = boardArr.every(Boolean);
      if (filled) winnerDisplay = "draw";
    }
  }

  const isGameOver = !!winnerDisplay;

  return (
    <ContainerMain>
      <h2>Tic-Tac-Toe Match</h2>
      <div className="match-status-row">
        <span>
          Players:
          <b> {game.player_x || "?"} (X)</b>
          &nbsp;vs&nbsp;
          <b>{game.player_o || "?"} (O)</b>
        </span>
        <button className="btn btn-small" onClick={onLeave}>
          Leave Match
        </button>
      </div>
      <TicTacToeBoard
        board={boardArr}
        onMove={makeMove}
        myMark={myMark}
        current={currentTurn}
        winner={winnerDisplay}
        disabled={isGameOver || (myMark !== currentTurn) || moveLoading}
      />
      <div className="match-meta">
        {winnerDisplay && (
          <div className="match-final-status">
            {winnerDisplay === "draw"
              ? "It's a draw!"
              : `Winner: ${winnerDisplay}`}
          </div>
        )}
      </div>
    </ContainerMain>
  );
}

// ======== LEADERBOARD ========

function LeaderboardPage({ auth }) {
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    apiRequest("/api/leaderboard", "GET", null, auth.token)
      .then(data => {
        // data is a list [{username, wins, losses, ties}]
        if (mounted) setLeaders(data);
      })
      .finally(() => setLoading(false));
    return () => {
      mounted = false;
    };
  }, [auth.token]);

  return (
    <ContainerMain>
      <h2>Leaderboard</h2>
      {loading ? (
        <div>Loading...</div>
      ) : (
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Wins</th>
              <th>Losses</th>
              <th>Draws</th>
            </tr>
          </thead>
          <tbody>
            {leaders.map((p, idx) => (
              <tr key={p.username}>
                <td>{idx + 1}</td>
                <td>{p.username}</td>
                <td>{p.wins}</td>
                <td>{p.losses}</td>
                <td>{p.ties}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ContainerMain>
  );
}

// ======== GAME HISTORY PAGE ========

function HistoryPage({ auth }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    apiRequest("/api/history", "GET", null, auth.token)
      .then(res => {
        if (mounted) setHistory(res.games || []);
      })
      .finally(() => setLoading(false));
    return () => { mounted = false; };
  }, [auth.token]);

  const myName = auth.profile?.username;

  return (
    <ContainerMain>
      <h2>Game History</h2>
      {loading ? <div>Loading...</div> :
        <div className="history-list">
          {history.length === 0 ? (
            <div>No matches played yet.</div>
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>You</th>
                  <th>Opponent</th>
                  <th>Result</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {history.map(item => {
                  // Identify opponent and result
                  let opponent = null;
                  if (item.player_x === myName) opponent = item.player_o;
                  else if (item.player_o === myName) opponent = item.player_x;
                  const isDraw = !item.winner && !item.is_active;
                  let result = "";
                  if (isDraw) result = "draw";
                  else if (item.winner === myName) result = "win";
                  else if (item.winner) result = "loss";
                  return (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{myName}</td>
                      <td>{opponent || "-"}</td>
                      <td>
                        {result === "win" && "Win"}
                        {result === "loss" && "Loss"}
                        {result === "draw" && "Draw"}
                      </td>
                      <td>{item.completed_at ? new Date(item.completed_at).toLocaleString() : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      }
    </ContainerMain>
  );
}

// ======== LANDING PAGE ========

function HomePage({ auth }) {
  return (
    <ContainerMain>
      <h1>Welcome to Tic Tac Toe Pro</h1>
      <p>
        Play classic Tic-Tac-Toe against the computer or friends. 
        <br />
        Track your stats, compete on the leaderboard, and replay your matches!
      </p>
      {auth.profile ? (
        <Link to="/lobby" className="btn btn-large">Go to Lobby</Link>
      ) : (
        <div>
          <Link to="/login" className="btn btn-large">Log In</Link>
          <span style={{ margin: "0 10px" }}></span>
          <Link to="/register" className="btn btn-large">Register</Link>
        </div>
      )}
    </ContainerMain>
  );
}

// ======== ROUTING GUARDS ========

function RequireAuth({ children, authed }) {
  const location = useLocation();
  if (!authed) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

// ======== MAIN APP ROUTING + STATE ========

function MainApp() {
  const auth = useAuth();
  const [activeGameId, setActiveGameId] = useState(null);

  // When navigating away from match, clear game state
  const handleLeaveMatch = useCallback(() => {
    setActiveGameId(null);
  }, []);

  return (
    <Router>
      <Navbar user={auth.profile} logout={auth.logout} />
      <Routes>
        <Route path="/" element={<HomePage auth={auth} />} />
        <Route
          path="/lobby"
          element={
            <RequireAuth authed={!!auth.profile}>
              {activeGameId
                ? (
                    <GamePage
                      auth={auth}
                      gameId={activeGameId}
                      onLeave={handleLeaveMatch}
                    />
                  )
                : (
                    <LobbyPage auth={auth} onOpenMatch={setActiveGameId} />
                  )}
            </RequireAuth>
          }
        />
        <Route
          path="/leaderboard"
          element={
            <RequireAuth authed={!!auth.profile}>
              <LeaderboardPage auth={auth} />
            </RequireAuth>
          }
        />
        <Route
          path="/history"
          element={
            <RequireAuth authed={!!auth.profile}>
              <HistoryPage auth={auth} />
            </RequireAuth>
          }
        />
        <Route path="/login" element={<LoginPage auth={auth} />} />
        <Route path="/register" element={<RegisterPage auth={auth} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default MainApp;
