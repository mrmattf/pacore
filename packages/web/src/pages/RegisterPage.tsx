import { Link } from 'react-router-dom';

export function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow text-center">
        <h1 className="text-2xl font-bold mb-4">Clarissi</h1>
        <p className="text-gray-600 mb-6">
          Access is by invitation only. Contact an administrator to get access.
        </p>
        <Link to="/login" className="text-blue-600 hover:underline text-sm">
          Back to login
        </Link>
      </div>
    </div>
  );
}
