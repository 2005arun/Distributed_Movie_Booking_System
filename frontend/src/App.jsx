import { useState, useEffect, useRef } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useParams, Navigate } from 'react-router-dom'
import api from './api.js'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

// ==================== NAVBAR ====================
function Navbar({ user, onLogout }) {
    return (
        <nav className="navbar">
            <Link to="/" className="navbar-brand">🎬 CineBook</Link>
            <div className="navbar-nav">
                <Link to="/">Movies</Link>
                {user ? (
                    <>
                        <Link to="/bookings">My Bookings</Link>
                        <div className="nav-user">
                            <div className="nav-user-avatar">{user.name?.charAt(0).toUpperCase()}</div>
                            <span style={{ fontSize: '0.9rem' }}>{user.name}</span>
                        </div>
                        <button onClick={onLogout}>Logout</button>
                    </>
                ) : (
                    <>
                        <Link to="/login">Login</Link>
                        <Link to="/signup" className="btn btn-primary btn-sm">Sign Up</Link>
                    </>
                )}
            </div>
        </nav>
    )
}

// ==================== LOGIN ====================
function LoginPage({ onLogin }) {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [showGoogleModal, setShowGoogleModal] = useState(false)
    const [googleForm, setGoogleForm] = useState({ email: '', name: '' })
    const navigate = useNavigate()
    const googleBtnRef = useRef(null)

    useEffect(() => {
        if (!GOOGLE_CLIENT_ID || !googleBtnRef.current) return
        const initGoogle = () => {
            if (window.google?.accounts?.id) {
                window.google.accounts.id.initialize({
                    client_id: GOOGLE_CLIENT_ID,
                    callback: handleGoogleResponse,
                })
                window.google.accounts.id.renderButton(googleBtnRef.current, {
                    theme: 'filled_black', size: 'large', width: 350, text: 'continue_with',
                })
            }
        }
        if (window.google?.accounts?.id) {
            initGoogle()
        } else {
            const timer = setInterval(() => {
                if (window.google?.accounts?.id) { initGoogle(); clearInterval(timer) }
            }, 200)
            return () => clearInterval(timer)
        }
    }, [])

    const handleGoogleResponse = async (response) => {
        setError('')
        setLoading(true)
        try {
            const result = await api.googleAuth(response.credential)
            onLogin(result.user)
            navigate('/')
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    // Mock Google Sign-In for demo (no real Client ID needed)
    const base64url = (obj) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    const handleMockGoogleSignIn = async (e) => {
        e.preventDefault()
        if (!googleForm.email) return
        setError('')
        setLoading(true)
        setShowGoogleModal(false)
        try {
            const header = base64url({ alg: 'RS256', typ: 'JWT' })
            const payload = base64url({
                email: googleForm.email,
                name: googleForm.name || googleForm.email.split('@')[0],
                sub: 'google_' + Date.now(),
                iat: Math.floor(Date.now() / 1000),
            })
            const mockCredential = `${header}.${payload}.mock_signature`
            const result = await api.googleAuth(mockCredential)
            onLogin(result.user)
            navigate('/')
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            const result = await api.login({ email, password })
            onLogin(result.user)
            navigate('/')
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="auth-page">
            <div className="auth-card slide-up">
                <h2>Welcome Back</h2>
                <p className="subtitle">Sign in to book your tickets</p>
                {error && <div className="alert alert-error">⚠️ {error}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Email</label>
                        <input type="email" className="form-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <input type="password" className="form-input" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
                    </div>
                    <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>
                </form>
                <div className="auth-divider">or</div>
                {GOOGLE_CLIENT_ID ? (
                    <div ref={googleBtnRef} style={{ display: 'flex', justifyContent: 'center' }}></div>
                ) : (
                    <button
                        type="button"
                        className="google-signin-btn"
                        onClick={() => setShowGoogleModal(true)}
                        disabled={loading}
                    >
                        <svg width="18" height="18" viewBox="0 0 48 48">
                            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                        </svg>
                        Sign in with Google
                    </button>
                )}

                {/* Mock Google Sign-In Modal */}
                {showGoogleModal && (
                    <div className="modal-overlay" onClick={() => setShowGoogleModal(false)}>
                        <div className="google-modal" onClick={e => e.stopPropagation()}>
                            <div className="google-modal-header">
                                <svg width="24" height="24" viewBox="0 0 48 48">
                                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                                </svg>
                                <h3>Sign in with Google</h3>
                                <p>Enter your Google account details</p>
                            </div>
                            <form onSubmit={handleMockGoogleSignIn}>
                                <div className="form-group">
                                    <label className="form-label">Email</label>
                                    <input
                                        type="email"
                                        className="form-input"
                                        value={googleForm.email}
                                        onChange={e => setGoogleForm({ ...googleForm, email: e.target.value })}
                                        placeholder="your.email@gmail.com"
                                        required
                                        autoFocus
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Display Name</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={googleForm.name}
                                        onChange={e => setGoogleForm({ ...googleForm, name: e.target.value })}
                                        placeholder="Your Name"
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                                    <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowGoogleModal(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Continue</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                <p className="auth-link">Don't have an account? <Link to="/signup">Sign up</Link></p>
            </div>
        </div>
    )
}

// ==================== SIGNUP ====================
function SignupPage({ onLogin }) {
    const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' })
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const navigate = useNavigate()

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            const result = await api.signup(form)
            onLogin(result.user)
            navigate('/')
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="auth-page">
            <div className="auth-card slide-up">
                <h2>Create Account</h2>
                <p className="subtitle">Join CineBook for the best movie experience</p>
                {error && <div className="alert alert-error">⚠️ {error}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Full Name</label>
                        <input type="text" className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="John Doe" required />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Email</label>
                        <input type="email" className="form-input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" required />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Phone (optional)</label>
                        <input type="tel" className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <input type="password" className="form-input" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min 6 characters" required minLength={6} />
                    </div>
                    <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
                        {loading ? 'Creating...' : 'Create Account'}
                    </button>
                </form>
                <p className="auth-link">Already have an account? <Link to="/login">Sign in</Link></p>
            </div>
        </div>
    )
}

// ==================== MOVIES LIST ====================
function MoviesPage() {
    const [movies, setMovies] = useState([])
    const [locations, setLocations] = useState([])
    const [loading, setLoading] = useState(true)
    const [filters, setFilters] = useState({ search: '', location_id: '', genre: '' })
    const navigate = useNavigate()

    useEffect(() => {
        loadMovies()
        loadLocations()
    }, [filters.location_id, filters.genre])

    const loadMovies = async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (filters.location_id) params.set('location_id', filters.location_id)
            if (filters.genre) params.set('genre', filters.genre)
            if (filters.search) params.set('search', filters.search)
            const data = await api.get(`/movies?${params}`)
            setMovies(data.movies || [])
        } catch (err) {
            console.error('Failed to load movies:', err)
            // Demo data
            setMovies([
                { id: 'd1000000-0000-0000-0000-000000000001', title: 'Inception', genre: 'Sci-Fi', language: 'English', duration_minutes: 148, rating: 8.8, poster_url: 'https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg' },
                { id: 'd1000000-0000-0000-0000-000000000002', title: 'The Dark Knight', genre: 'Action', language: 'English', duration_minutes: 152, rating: 9.0, poster_url: 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911BTUgMe1nVke0.jpg' },
                { id: 'd1000000-0000-0000-0000-000000000003', title: 'Interstellar', genre: 'Sci-Fi', language: 'English', duration_minutes: 169, rating: 8.6, poster_url: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg' },
                { id: 'd1000000-0000-0000-0000-000000000004', title: 'RRR', genre: 'Action', language: 'Telugu', duration_minutes: 187, rating: 8.0, poster_url: 'https://image.tmdb.org/t/p/w500/nEufeZYpR9hvEod9GkVmMCgYhYH.jpg' },
                { id: 'd1000000-0000-0000-0000-000000000005', title: 'Jawan', genre: 'Action', language: 'Hindi', duration_minutes: 169, rating: 7.5, poster_url: 'https://image.tmdb.org/t/p/w500/jFeBzUsCRdsaRfu6pBDDCVNmOZp.jpg' },
                { id: 'd1000000-0000-0000-0000-000000000006', title: 'Oppenheimer', genre: 'Drama', language: 'English', duration_minutes: 180, rating: 8.5, poster_url: 'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg' },
            ])
        } finally {
            setLoading(false)
        }
    }

    const loadLocations = async () => {
        try {
            const data = await api.get('/locations')
            setLocations(data || [])
        } catch {
            setLocations([
                { id: 'a1000000-0000-0000-0000-000000000001', city: 'Mumbai' },
                { id: 'a1000000-0000-0000-0000-000000000002', city: 'Delhi' },
                { id: 'a1000000-0000-0000-0000-000000000003', city: 'Bangalore' },
            ])
        }
    }

    const movieEmojis = { 'Sci-Fi': '🚀', 'Action': '💥', 'Drama': '🎭', 'Comedy': '😄', 'Horror': '👻', 'Romance': '❤️', 'Thriller': '🔪' }

    const filteredMovies = filters.search
        ? movies.filter(m => m.title.toLowerCase().includes(filters.search.toLowerCase()))
        : movies

    return (
        <div className="container fade-in">
            <div className="page-header">
                <h1>🎬 Now Showing</h1>
                <p>Book tickets for the latest blockbusters</p>
            </div>

            <div className="filter-bar">
                <input
                    className="search-input" placeholder="🔍 Search movies..."
                    value={filters.search}
                    onChange={e => setFilters({ ...filters, search: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && loadMovies()}
                />
                <select className="filter-select" value={filters.location_id} onChange={e => setFilters({ ...filters, location_id: e.target.value })}>
                    <option value="">📍 All Cities</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.city}</option>)}
                </select>
                <select className="filter-select" value={filters.genre} onChange={e => setFilters({ ...filters, genre: e.target.value })}>
                    <option value="">🎭 All Genres</option>
                    {['Action', 'Sci-Fi', 'Drama', 'Comedy', 'Horror', 'Romance', 'Thriller'].map(g =>
                        <option key={g} value={g}>{g}</option>
                    )}
                </select>
            </div>

            {loading ? (
                <div className="loading"><div className="spinner"></div><p>Loading movies...</p></div>
            ) : filteredMovies.length === 0 ? (
                <div className="empty-state"><div className="icon">🎬</div><p>No movies found</p></div>
            ) : (
                <div className="movie-grid">
                    {filteredMovies.map(movie => (
                        <div key={movie.id} className="card movie-card" onClick={() => navigate(`/movie/${movie.id}`)}>
                            <div className="movie-poster">
                                <span className="poster-emoji">{movieEmojis[movie.genre] || '🎬'}</span>
                                {movie.poster_url && (
                                    <img src={movie.poster_url} alt="" loading="lazy"
                                         onError={e => { e.target.style.display = 'none' }} />
                                )}
                                <div className="movie-rating">⭐ {movie.rating}</div>
                            </div>
                            <div className="card-body movie-info">
                                <h3>{movie.title}</h3>
                                <div className="movie-meta">
                                    <span className="badge">{movie.genre}</span>
                                    <span>{movie.language}</span>
                                    <span>{Math.floor(movie.duration_minutes / 60)}h {movie.duration_minutes % 60}m</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// ==================== MOVIE DETAIL + SHOWS ====================
function MovieDetailPage() {
    const { id } = useParams()
    const [movie, setMovie] = useState(null)
    const [shows, setShows] = useState([])
    const [loading, setLoading] = useState(true)
    const navigate = useNavigate()

    useEffect(() => {
        loadMovie()
    }, [id])

    const loadMovie = async () => {
        setLoading(true)
        try {
            const data = await api.get(`/movies/${id}`)
            setMovie(data)
            // Load shows for this movie
            const showData = await api.get(`/shows?movie_id=${id}`)
            setShows(showData.grouped || [])
        } catch (err) {
            console.error('Failed to load movie:', err)
            setMovie({ id, title: 'Movie', genre: 'Action', duration_minutes: 150, rating: 8.0, description: 'An amazing movie experience.' })
        } finally {
            setLoading(false)
        }
    }

    if (loading) return <div className="loading"><div className="spinner"></div></div>
    if (!movie) return <div className="container"><div className="empty-state">Movie not found</div></div>

    return (
        <div className="container fade-in">
            <Link to="/" className="back-link">← Back to Movies</Link>

            <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
                <div className="detail-poster">
                    <span style={{ fontSize: '4rem' }}>🎬</span>
                    {movie.poster_url && (
                        <img src={movie.poster_url} alt=""
                             onError={e => { e.target.style.display = 'none' }} />
                    )}
                </div>
                <div style={{ flex: 1 }}>
                    <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>{movie.title}</h1>
                    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                        <span className="badge badge-accent">{movie.genre}</span>
                        <span className="badge">{movie.language}</span>
                        <span className="badge">⭐ {movie.rating}</span>
                        <span className="badge">🕐 {Math.floor(movie.duration_minutes / 60)}h {movie.duration_minutes % 60}m</span>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{movie.description}</p>
                </div>
            </div>

            <h2 style={{ marginBottom: '1.5rem' }}>🎟️ Available Shows</h2>

            {shows.length === 0 ? (
                <div className="empty-state">
                    <div className="icon">📅</div>
                    <p>No shows available. Check back later!</p>
                </div>
            ) : (
                shows.map(group => (
                    <div key={group.theater_id} className="theater-group">
                        <h3>🏢 {group.theater_name} <span className="city">• {group.city}</span></h3>
                        <div className="show-times-grid">
                            {group.shows.map(show => (
                                <div
                                    key={show.id}
                                    className="show-time-card"
                                    onClick={() => navigate(`/seats/${show.id}`)}
                                >
                                    <div className="time">{new Date(show.start_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                                    <div className="price">₹{show.base_price}</div>
                                    <div className="screen">{show.screen_name}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))
            )}
        </div>
    )
}

// ==================== SEAT SELECTION ====================
function SeatSelectionPage() {
    const { showId } = useParams()
    const [seatData, setSeatData] = useState(null)
    const [selectedSeats, setSelectedSeats] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [locking, setLocking] = useState(false)
    const navigate = useNavigate()

    useEffect(() => { loadSeats() }, [showId])

    const loadSeats = async () => {
        setLoading(true)
        try {
            const data = await api.get(`/shows/${showId}/seats`)
            setSeatData(data)
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const toggleSeat = (seat) => {
        if (seat.status !== 'available') return
        setSelectedSeats(prev =>
            prev.find(s => s.id === seat.id)
                ? prev.filter(s => s.id !== seat.id)
                : prev.length < 10 ? [...prev, seat] : prev
        )
    }

    const handleProceed = async () => {
        if (!api.isLoggedIn()) {
            navigate('/login')
            return
        }
        if (selectedSeats.length === 0) return

        setLocking(true)
        setError('')
        try {
            // Lock seats
            await api.post('/bookings/lock-seats', {
                show_id: showId,
                seat_ids: selectedSeats.map(s => s.id),
            })

            // Create booking
            const result = await api.post('/bookings', {
                show_id: showId,
                seat_ids: selectedSeats.map(s => s.id),
            })

            navigate(`/payment/${result.booking.id}`)
        } catch (err) {
            setError(err.message)
            setSelectedSeats([])
            loadSeats() // Reload seat status
        } finally {
            setLocking(false)
        }
    }

    const totalAmount = selectedSeats.reduce((sum, s) => sum + parseFloat(s.price), 0)

    if (loading) return <div className="loading"><div className="spinner"></div><p>Loading seats...</p></div>
    if (!seatData) return <div className="container"><div className="alert alert-error">Failed to load seat data</div></div>

    const { show, rows, summary } = seatData

    return (
        <div className="container fade-in">
            <Link to={`/movie/${show.movie_id || ''}`} className="back-link">← Back to Shows</Link>

            <div className="page-header">
                <h1>{show.movie_title}</h1>
                <p>🏢 {show.theater_name} • 🖥 {show.screen_name} • 🕐 {new Date(show.start_time).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
            </div>

            {error && <div className="alert alert-error">⚠️ {error}</div>}

            <div className="two-col">
                <div className="seat-map-container slide-up">
                    <div className="screen-indicator"></div>

                    {Object.entries(rows).map(([label, rowSeats]) => (
                        <div key={label} className="seat-row">
                            <div className="seat-row-label">{label}</div>
                            {rowSeats.map(seat => (
                                <div
                                    key={seat.id}
                                    className={`seat seat-${selectedSeats.find(s => s.id === seat.id) ? 'selected' : seat.status} ${seat.seat_type !== 'regular' ? `seat-${seat.seat_type}` : ''}`}
                                    onClick={() => toggleSeat(seat)}
                                    title={`${label}${seat.seat_number} - ₹${seat.price} (${seat.seat_type})`}
                                >
                                    {seat.seat_number}
                                </div>
                            ))}
                            <div className="seat-row-label">{label}</div>
                        </div>
                    ))}

                    <div className="seat-legend">
                        <div className="seat-legend-item">
                            <div className="seat-legend-box" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}></div>
                            Available
                        </div>
                        <div className="seat-legend-item">
                            <div className="seat-legend-box" style={{ background: 'var(--accent-primary)', borderColor: 'var(--accent-primary)' }}></div>
                            Selected
                        </div>
                        <div className="seat-legend-item">
                            <div className="seat-legend-box" style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'transparent', opacity: 0.3 }}></div>
                            Booked
                        </div>
                        <div className="seat-legend-item">
                            <div className="seat-legend-box" style={{ borderColor: 'rgba(255, 215, 0, 0.3)', background: 'transparent' }}></div>
                            VIP
                        </div>
                        <div className="seat-legend-item">
                            <div className="seat-legend-box" style={{ borderColor: 'rgba(78, 159, 255, 0.3)', background: 'transparent' }}></div>
                            Premium
                        </div>
                    </div>

                    <div style={{ textAlign: 'center', marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        {summary.available} available • {summary.booked} booked • {summary.locked} locked
                    </div>
                </div>

                <div className="booking-summary slide-up" style={{ animationDelay: '0.1s' }}>
                    <h3 style={{ marginBottom: '1rem' }}>Booking Summary</h3>

                    {selectedSeats.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Select seats to continue</p>
                    ) : (
                        <>
                            <div className="summary-row">
                                <span className="label">Seats ({selectedSeats.length})</span>
                                <span className="value">{selectedSeats.map(s => `${s.row_label}${s.seat_number}`).join(', ')}</span>
                            </div>
                            {selectedSeats.map(s => (
                                <div key={s.id} className="summary-row">
                                    <span className="label">{s.row_label}{s.seat_number} ({s.seat_type})</span>
                                    <span className="value">₹{s.price}</span>
                                </div>
                            ))}
                            <div className="summary-row total">
                                <span className="label">Total</span>
                                <span className="value">₹{totalAmount.toFixed(2)}</span>
                            </div>
                            <button
                                className="btn btn-primary btn-block btn-lg"
                                style={{ marginTop: '1.5rem' }}
                                onClick={handleProceed}
                                disabled={locking}
                            >
                                {locking ? '🔒 Locking Seats...' : `Pay ₹${totalAmount.toFixed(2)}`}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

// ==================== PAYMENT PAGE ====================
function PaymentPage() {
    const { bookingId } = useParams()
    const [booking, setBooking] = useState(null)
    const [loading, setLoading] = useState(true)
    const [processing, setProcessing] = useState(false)
    const [error, setError] = useState('')
    const navigate = useNavigate()

    useEffect(() => { loadBooking() }, [bookingId])

    const loadBooking = async () => {
        try {
            const data = await api.get(`/bookings/${bookingId}`)
            setBooking(data)
            if (data.status === 'CONFIRMED') {
                navigate(`/ticket/${bookingId}`)
                return
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handlePayment = async () => {
        setProcessing(true)
        setError('')
        try {
            // Step 1: Initiate payment on backend
            const payResult = await api.post('/payments/initiate', { booking_id: bookingId })

            // Step 2: Redirect to payment gateway page
            const orderId = payResult.gateway_config.order_id
            const callbackUrl = encodeURIComponent(`${window.location.origin}/payment-callback/${bookingId}`)
            window.location.href = `/api/payments/gateway/${orderId}?callback=${callbackUrl}`
        } catch (err) {
            setError(err.message)
            setProcessing(false)
        }
    }

    if (loading) return <div className="loading"><div className="spinner"></div></div>
    if (!booking) return <div className="container"><div className="alert alert-error">Booking not found</div></div>

    return (
        <div className="container fade-in">
            <div className="payment-section slide-up">
                <div className="page-header" style={{ textAlign: 'center' }}>
                    <h1>💳 Complete Payment</h1>
                    <p>Secure checkout for your booking</p>
                </div>

                {error && <div className="alert alert-error">⚠️ {error}</div>}

                <div className="booking-summary" style={{ marginBottom: '2rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>🎬 {booking.movie_title}</h3>
                    <div className="summary-row">
                        <span className="label">Theater</span>
                        <span className="value">{booking.theater_name}</span>
                    </div>
                    <div className="summary-row">
                        <span className="label">Screen</span>
                        <span className="value">{booking.screen_name}</span>
                    </div>
                    <div className="summary-row">
                        <span className="label">Show Time</span>
                        <span className="value">{new Date(booking.start_time).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    </div>
                    <div className="summary-row">
                        <span className="label">Seats</span>
                        <span className="value">{booking.seats?.map(s => `${s.row_label}${s.seat_number}`).join(', ')}</span>
                    </div>
                    <div className="summary-row total">
                        <span className="label">Total Amount</span>
                        <span className="value">₹{booking.total_amount}</span>
                    </div>
                </div>

                <div style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem'
                }}>
                    <span style={{ fontSize: '2rem' }}>🔒</span>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Secure Payment Gateway</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            You'll be redirected to our secure payment gateway to complete the payment via Card, UPI, or Net Banking.
                        </div>
                    </div>
                </div>

                <button
                    className="btn btn-success btn-block btn-lg pulse"
                    onClick={handlePayment}
                    disabled={processing}
                >
                    {processing ? '⏳ Redirecting to Payment Gateway...' : `Proceed to Pay ₹${booking.total_amount}`}
                </button>

                <p style={{ textAlign: 'center', marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    🔒 256-bit SSL encrypted. Booking ID: {bookingId.slice(0, 8)}
                </p>
            </div>
        </div>
    )
}

// ==================== PAYMENT CALLBACK PAGE ====================
function PaymentCallbackPage() {
    const { bookingId } = useParams()
    const [step, setStep] = useState('verifying')
    const [error, setError] = useState('')
    const [emailPopup, setEmailPopup] = useState(null) // { email, visible }
    const navigate = useNavigate()

    useEffect(() => {
        // Two separate flags:
        // - `cancelled`: set ONLY by cleanup (unmount). Stops everything.
        // - `resolved`: set when payment result is determined. Stops polling only.
        let cancelled = false
        let resolved = false
        const animTimers = []

        const params = new URLSearchParams(window.location.search)
        const paymentResult = params.get('status')

        if (paymentResult === 'failed') {
            setStep('failed')
            setError('Payment was declined or cancelled.')
            return () => { cancelled = true }
        }

        // Fetch email notification status for this booking
        const fetchEmailStatus = async () => {
            try {
                const notif = await api.get(`/notifications/booking/${bookingId}`)
                if (notif.email_sent && notif.email_sent_to) {
                    setEmailPopup({ email: notif.email_sent_to, visible: true })
                    // Auto-hide popup after 6 seconds
                    animTimers.push(setTimeout(() => {
                        if (!cancelled) setEmailPopup(prev => prev ? { ...prev, visible: false } : null)
                    }, 6000))
                }
            } catch {
                // Notification might not be ready yet, ignore
            }
        }

        // Poll backend for webhook confirmation
        const verify = async () => {
            if (cancelled || resolved) return
            try {
                const payment = await api.get(`/payments/${bookingId}`)
                if (cancelled || resolved) return
                if (payment.status === 'SUCCESS') {
                    resolved = true
                    setStep('confirmed')
                    // Animate through the remaining steps (webhook already handled these on backend)
                    animTimers.push(setTimeout(() => { if (!cancelled) setStep('ticket') }, 1200))
                    animTimers.push(setTimeout(() => { if (!cancelled) setStep('email') }, 2400))
                    animTimers.push(setTimeout(() => {
                        if (!cancelled) {
                            setStep('complete')
                            // Fetch email status when reaching complete
                            fetchEmailStatus()
                            animTimers.push(setTimeout(() => { if (!cancelled) navigate(`/ticket/${bookingId}`) }, 3000))
                        }
                    }, 3600))
                    return
                }
                if (payment.status === 'FAILED') {
                    resolved = true
                    setStep('failed')
                    setError('Payment verification failed.')
                    return
                }
                // Still processing — poll again
                if (!cancelled && !resolved) setTimeout(verify, 2000)
            } catch {
                if (!cancelled && !resolved) setTimeout(verify, 2000)
            }
        }

        // Start polling after brief delay
        const startTimer = setTimeout(verify, 600)

        // Timeout after 30 seconds
        const timeoutTimer = setTimeout(() => {
            if (!cancelled && !resolved) {
                resolved = true
                setStep('failed')
                setError('Payment verification timed out. Please check your bookings.')
            }
        }, 30000)

        return () => {
            cancelled = true
            clearTimeout(startTimer)
            clearTimeout(timeoutTimer)
            animTimers.forEach(t => clearTimeout(t))
        }
    }, [bookingId, navigate])

    const steps = [
        { key: 'verifying', icon: '🔍', label: 'Verifying Payment via Webhook' },
        { key: 'confirmed', icon: '✅', label: 'Payment Confirmed' },
        { key: 'ticket', icon: '🎫', label: 'Generating Ticket' },
        { key: 'email', icon: '📧', label: 'Sending Confirmation Email' },
        { key: 'complete', icon: '🎉', label: 'Booking Complete!' },
    ]
    const stepOrder = ['verifying', 'confirmed', 'ticket', 'email', 'complete']
    const currentIdx = stepOrder.indexOf(step)

    if (step === 'failed') {
        return (
            <div className="container fade-in" style={{ maxWidth: '500px', margin: '0 auto', padding: '3rem 1rem', textAlign: 'center' }}>
                <div className="payment-section slide-up">
                    <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>❌</div>
                    <h2 style={{ color: 'var(--accent-primary)', marginBottom: '0.5rem' }}>Payment Failed</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>{error}</p>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                        <button className="btn btn-primary" onClick={() => navigate(`/payment/${bookingId}`)}>Try Again</button>
                        <Link to="/bookings" className="btn btn-secondary">My Bookings</Link>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="container fade-in" style={{ maxWidth: '500px', margin: '0 auto', padding: '3rem 1rem' }}>
            <div className="payment-section slide-up" style={{ textAlign: 'center' }}>
                {step === 'complete' ? (
                    <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎉</div>
                ) : (
                    <div className="spinner" style={{ margin: '0 auto 1.5rem' }}></div>
                )}
                <h2 style={{ marginBottom: '2rem', color: step === 'complete' ? 'var(--success)' : 'inherit' }}>
                    {steps[currentIdx >= 0 ? currentIdx : 0].icon} {steps[currentIdx >= 0 ? currentIdx : 0].label}
                </h2>
                <div style={{ textAlign: 'left', maxWidth: '300px', margin: '0 auto' }}>
                    {steps.map((s, i) => (
                        <div key={s.key} style={{
                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                            padding: '0.6rem 0',
                            color: i <= currentIdx ? 'var(--text-primary)' : 'var(--text-muted)',
                            fontWeight: i === currentIdx ? 600 : 400,
                            transition: 'all 0.3s ease',
                        }}>
                            <span>{i < currentIdx ? '✅' : i === currentIdx ? s.icon : '⬜'}</span>
                            <span>{s.label}</span>
                        </div>
                    ))}
                </div>
                {step !== 'complete' && (
                    <p style={{ color: 'var(--text-muted)', marginTop: '2rem', fontSize: '0.85rem' }}>
                        Please don't close this page
                    </p>
                )}
            </div>

            {/* Email Sent Toast Popup */}
            {emailPopup && (
                <div style={{
                    position: 'fixed',
                    bottom: emailPopup.visible ? '2rem' : '-8rem',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'linear-gradient(135deg, #065f46, #047857)',
                    color: '#fff',
                    padding: '1rem 1.5rem',
                    borderRadius: '12px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    zIndex: 9999,
                    transition: 'bottom 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                    maxWidth: '90vw',
                    minWidth: '320px',
                }}>
                    <div style={{
                        width: '40px', height: '40px', borderRadius: '50%',
                        background: 'rgba(255,255,255,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.2rem', flexShrink: 0,
                    }}>📧</div>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Confirmation Email Sent!</div>
                        <div style={{ fontSize: '0.8rem', opacity: 0.9, marginTop: '2px' }}>
                            Sent to <strong>{emailPopup.email}</strong>
                        </div>
                    </div>
                    <button
                        onClick={() => setEmailPopup(prev => prev ? { ...prev, visible: false } : null)}
                        style={{
                            background: 'none', border: 'none', color: '#fff', cursor: 'pointer',
                            fontSize: '1.2rem', padding: '0 0 0 0.5rem', opacity: 0.7, marginLeft: 'auto',
                        }}
                    >✕</button>
                </div>
            )}
        </div>
    )
}

// ==================== TICKET PAGE ====================
function TicketPage() {
    const { bookingId } = useParams()
    const [booking, setBooking] = useState(null)
    const [ticket, setTicket] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => { loadTicket() }, [bookingId])

    const loadTicket = async () => {
        try {
            const bookingData = await api.get(`/bookings/${bookingId}`)
            setBooking(bookingData)

            try {
                const ticketData = await api.get(`/tickets/${bookingId}`)
                setTicket(ticketData)
            } catch {
                // Ticket might not be generated yet
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    if (loading) return <div className="loading"><div className="spinner"></div></div>
    if (!booking) return <div className="container"><div className="alert alert-error">Booking not found</div></div>

    return (
        <div className="container fade-in" style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem' }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🎉</div>
                <h1 style={{ color: 'var(--success)' }}>Booking Confirmed!</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Your ticket is ready</p>
            </div>

            <div className="ticket-card slide-up">
                <div className="ticket-header">
                    <h2>🎬 {booking.movie_title}</h2>
                </div>

                <div className="ticket-body">
                    {ticket?.qr_code && (
                        <div className="ticket-qr">
                            <img src={ticket.qr_code} alt="Ticket QR Code" />
                        </div>
                    )}

                    <div className="ticket-detail">
                        <span className="label">Theater</span>
                        <span className="value">{booking.theater_name}</span>
                    </div>
                    <div className="ticket-detail">
                        <span className="label">Screen</span>
                        <span className="value">{booking.screen_name}</span>
                    </div>
                    <div className="ticket-detail">
                        <span className="label">Date & Time</span>
                        <span className="value">{new Date(booking.start_time).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    </div>
                    <div className="ticket-detail">
                        <span className="label">Seats</span>
                        <span className="value">{booking.seats?.map(s => `${s.row_label}${s.seat_number}`).join(', ')}</span>
                    </div>
                    <div className="ticket-detail">
                        <span className="label">Amount Paid</span>
                        <span className="value" style={{ color: 'var(--success)' }}>₹{booking.total_amount}</span>
                    </div>
                    <div className="ticket-detail">
                        <span className="label">Booking ID</span>
                        <span className="value" style={{ fontSize: '0.8rem' }}>{bookingId.slice(0, 8).toUpperCase()}</span>
                    </div>
                    <div className="ticket-detail">
                        <span className="label">Status</span>
                        <span className={`status-badge status-${booking.status}`}>{booking.status}</span>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'center' }}>
                <Link to="/bookings" className="btn btn-secondary">My Bookings</Link>
                <Link to="/" className="btn btn-primary">Browse Movies</Link>
            </div>
        </div>
    )
}

// ==================== BOOKINGS LIST ====================
function BookingsPage() {
    const [bookings, setBookings] = useState([])
    const [loading, setLoading] = useState(true)
    const navigate = useNavigate()

    useEffect(() => { loadBookings() }, [])

    const loadBookings = async () => {
        try {
            const data = await api.get('/bookings/user/me')
            setBookings(data || [])
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    if (loading) return <div className="loading"><div className="spinner"></div></div>

    return (
        <div className="container fade-in">
            <div className="page-header">
                <h1>🎟️ My Bookings</h1>
                <p>View your booking history</p>
            </div>

            {bookings.length === 0 ? (
                <div className="empty-state">
                    <div className="icon">🎬</div>
                    <p>No bookings yet. Start booking!</p>
                    <Link to="/" className="btn btn-primary" style={{ marginTop: '1rem' }}>Browse Movies</Link>
                </div>
            ) : (
                <div className="booking-list">
                    {bookings.map(b => (
                        <div key={b.id} className="booking-item" onClick={() => navigate(`/ticket/${b.id}`)}>
                            <div className="booking-poster">🎬</div>
                            <div className="booking-details">
                                <h3>{b.movie_title}</h3>
                                <div className="booking-meta">
                                    <span>🏢 {b.theater_name}</span>
                                    <span>🖥 {b.screen_name}</span>
                                    <span>🕐 {new Date(b.start_time).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span>
                                    <span>💰 ₹{b.total_amount}</span>
                                </div>
                                <div style={{ marginTop: '0.5rem' }}>
                                    <span className={`status-badge status-${b.status}`}>{b.status}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// ==================== PROTECTED ROUTE ====================
function ProtectedRoute({ children, user }) {
    if (!user) return <Navigate to="/login" replace />
    return children
}

// ==================== APP ====================
function App() {
    const [user, setUser] = useState(api.getUser())

    const handleLogin = (userData) => {
        setUser(userData)
    }

    const handleLogout = () => {
        api.logout()
        setUser(null)
    }

    return (
        <Router>
            <Routes>
                <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
                <Route path="/signup" element={<SignupPage onLogin={handleLogin} />} />
                <Route path="*" element={
                    <>
                        <Navbar user={user} onLogout={handleLogout} />
                        <Routes>
                            <Route path="/" element={<MoviesPage />} />
                            <Route path="/movie/:id" element={<MovieDetailPage />} />
                            <Route path="/seats/:showId" element={<SeatSelectionPage />} />
                            <Route path="/payment/:bookingId" element={
                                <ProtectedRoute user={user}><PaymentPage /></ProtectedRoute>
                            } />
                            <Route path="/payment-callback/:bookingId" element={
                                <ProtectedRoute user={user}><PaymentCallbackPage /></ProtectedRoute>
                            } />
                            <Route path="/ticket/:bookingId" element={
                                <ProtectedRoute user={user}><TicketPage /></ProtectedRoute>
                            } />
                            <Route path="/bookings" element={
                                <ProtectedRoute user={user}><BookingsPage /></ProtectedRoute>
                            } />
                        </Routes>
                    </>
                } />
            </Routes>
        </Router>
    )
}

export default App
