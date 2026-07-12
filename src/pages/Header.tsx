import { Link } from 'react-router-dom';
import '@/styles/header.scss';
import nav_logo from '@/assets/images/z-logo.png'; // 导入图片

export default function Header() {
    return (
        <header className="header" id="header">
            <nav className="nav">
                <Link to="/" className="logo">
                    <img src={nav_logo} alt="Z" className="nav_logo" />
                    <span>Coulson Zero</span>
                </Link>
                <ul className="navbar">
                    <li><Link to="/" className="nav-link active">Overview</Link></li>
                    <li><Link to="/chat" className="nav-link">Chat</Link></li>
                    <li><Link to="/music" className="nav-link">Music</Link></li>
                    <li><Link to="/video" className="nav-link">Video</Link></li>
                </ul>
                <div className="nav_btn">
                    <Link to="/login" className="btn">Login</Link>
                </div>
            </nav>
        </header>
    );

}
