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

// ======== API SETUP AND HELPERS ========

// PUBLIC_INTERFACE
export const API_BASE =
  process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";

// PUBLIC_INTERFACE
async function apiRequest(endpoint, method = "GET", body, authToken = null) {
  // Simple API fetcher with optional JWT
  let options = {
    method,
    headers: {
      "Content-Type": "application/json",
    }
  };
  if (authToken) {
    options.headers["Authorization"] = `Bearer ${authToken}`;
  }
  if (body) {
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${API_BASE}${endpoint}`, options);
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

  // Fetch profile if JWT changes
  useEffect(() => {
    const fetchProfile = async () => {
      if (token) {
        setLoading(true);
        try {
          const p = await apiRequest("/users/me", "GET", null, token);
          setProfile(p);
        } catch {
          setProfile(null);
        }
        setLoading(false);
      }
    };
    fetchProfile();
  }, [token]);

  // PUBLIC_INTERFACE
  const login = async (username, password) => {
    setLoading(true);
    try {
      const res = await apiRequest("/auth/login", "POST", { username, password });
      setToken(res.access_token);
      setProfile(null); // Triggers reload in effect
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
      await apiRequest("/auth/register", "POST", { username, password });
      setLoading(false);
      // auto-login on register
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

  // Poll for open/active games every 4 seconds
  useEffect(() => {
    let running = true;
    async function pollLobby() {
      setLoading(true);
      try {
        const data = await apiRequest("/games/lobby", "GET", null, auth.token);
        if (running) setActiveGames(data.games || []);
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
  }, [auth.token]);

  // Start new game handler
  const handleNewGame = useCallback(
    async isMulti => {
      setLoading(true);
      try {
        const endpoint = isMulti ? "/games" : "/games/single";
        const g = await apiRequest(endpoint, "POST", {}, auth.token);
        // API should return {id: ...}
        onOpenMatch(g.id);
      } catch (e) {
        // report error
        alert("Unable to start game.");
      }
      setLoading(false);
    },
    [auth, onOpenMatch]
  );

  // Join game handler
  const handleJoin = async gameId => {
    setLoading(true);
    try {
      const g = await apiRequest(`/games/${gameId}/join`, "POST", {}, auth.token);
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

  // Poll for game state
  useEffect(() => {
    let running = true;
    async function pollGame() {
      setLoading(true);
      try {
        const data = await apiRequest(`/games/${gameId}`, "GET", null, auth.token);
        if (running) setGame(data);
      } catch (e) {
        // error
      }
      setLoading(false);
    }
    pollGame();
    const interval = setInterval(pollGame, 1800);
    return () => {
      running = false;
      clearInterval(interval);
    };
  }, [gameId, auth.token]);

  // Make move
  async function makeMove(idx) {
    setMoveLoading(true);
    try {
      await apiRequest(
        `/games/${gameId}/move`,
        "POST",
        { cell: idx },
        auth.token
      );
      // will update via poll
    } catch (e) {
      // error feedback
      alert("Invalid move.");
    }
    setMoveLoading(false);
  }

  if (loading || !game) {
    return <ContainerMain><div>Loading match...</div></ContainerMain>;
  }

  // Identify my mark (X or O) and if my turn
  const myMark = game.players && Object.entries(game.players).find(([_, name]) => name === auth.profile.username)?.[0];
  const isGameOver = !!game.winner;

  return (
    <ContainerMain>
      <h2>Tic-Tac-Toe Match</h2>
      <div className="match-status-row">
        <span>Players: 
          <b> {game.players?.X || "?"} (X)</b> &nbsp;vs&nbsp; 
          <b>{game.players?.O || "?"} (O)</b>
        </span>
        <button className="btn btn-small" onClick={onLeave}>
          Leave Match
        </button>
      </div>
      <TicTacToeBoard
        board={game.board || Array(9).fill("")}
        onMove={makeMove}
        myMark={myMark}
        current={game.turn}
        winner={game.winner}
        disabled={isGameOver || (myMark !== game.turn) || moveLoading}
      />
      <div className="match-meta">
        {game.winner && (
          <div className="match-final-status">
            {game.winner === "draw"
              ? "It's a draw!"
              : `Winner: ${game.winner} (${game.players?.[game.winner] || "?"})`}
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
    apiRequest("/leaderboard", "GET", null, auth.token)
      .then(data => {
        if (mounted) setLeaders(data.leaderboard || []);
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
                <td>{p.draws}</td>
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
    apiRequest("/games/history", "GET", null, auth.token)
      .then(data => {
        if (mounted) setHistory(data.history || []);
      })
      .finally(() => setLoading(false));
    return () => { mounted = false; };
  }, [auth.token]);

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
                {history.map(item => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{auth.profile.username}</td>
                    <td>{item.opponent}</td>
                    <td>
                      {item.result === "win" && "Win"}
                      {item.result === "loss" && "Loss"}
                      {item.result === "draw" && "Draw"}
                    </td>
                    <td>{item.date ? new Date(item.date).toLocaleString() : ""}</td>
                  </tr>
                ))}
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
