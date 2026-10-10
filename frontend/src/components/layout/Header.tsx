
import React from 'react';
import { Link, NavLink } from 'react-router-dom';

export const Header: React.FC = () => {
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap text-sm font-medium transition-colors ${
      isActive
        ? 'text-blue-600'
        : 'text-slate-600 hover:text-blue-600'
    }`;

  return (
    <header className="relative z-50 w-full border-b border-slate-200 bg-white shadow-sm">
      <div className="flex min-h-16 w-full items-center justify-between gap-4 px-4 sm:px-6">

        {/* Logo */}
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 font-bold text-white">
            T
          </span>
          <span className="whitespace-nowrap text-lg font-bold text-slate-900">
            TokenEstate
          </span>
        </Link>

        {/* Main Navigation */}
        <nav className="hidden items-center gap-4 md:flex lg:gap-6">
          <NavLink to="/dashboard" className={navLinkClass}>
            Dashboard
          </NavLink>
          <NavLink to="/properties" className={navLinkClass}>
            Properties
          </NavLink>
          <NavLink to="/marketplace" className={navLinkClass}>
            Marketplace
          </NavLink>
        </nav>

        {/* Authentication Buttons */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Link
            to="/login"
            className="inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Login
          </Link>

          <Link
            to="/signup"
            className="inline-flex items-center justify-center whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </header>
  );
};

export default Header;

