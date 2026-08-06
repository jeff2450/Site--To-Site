import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'

interface Job {
  id: string
  url: string
  app_name: string
  package_id: string
  platforms: string[]
  status: 'pending' | 'processing' | 'completed' | 'failed'
  created_at: string
  downloadUrls?: Record<string, string>
}

interface PlatformOption {
  id: string
  name: string
  description: string
  icon: string
}

const PLATFORMS: PlatformOption[] = [
  { id: 'android', name: 'Android APK', description: 'For Android devices (sideload)', icon: '📱' },
  { id: 'windows', name: 'Windows EXE', description: 'For Windows 10/11', icon: '💻' },
]

function App() {
  const [url, setUrl] = useState('')
  const [appName, setAppName] = useState('')
  const [packageId, setPackageId] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoginView, setIsLoginView] = useState(true)

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (isLoggedIn) {
      fetchJobs()
    }
  }, [isLoggedIn])

  async function fetchJobs() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/api/jobs', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setJobs(data)
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err)
    }
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    try {
      if (isLoginView) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        alert('Check your email for the confirmation link!')
      }
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setIsLoggedIn(false)
    setJobs([])
  }

  function togglePlatform(platformId: string) {
    setSelectedPlatforms(prev =>
      prev.includes(platformId)
        ? prev.filter(p => p !== platformId)
        : [...prev, platformId]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('You must be logged in to submit a job')
      }

      const formData = new FormData()
      formData.append('url', url)
      formData.append('appName', appName)
      formData.append('packageId', packageId)
      formData.append('platforms', JSON.stringify(selectedPlatforms))
      
      if (iconFile) {
        formData.append('icon', iconFile)
      }

      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit job')
      }

      // Reset form
      setUrl('')
      setAppName('')
      setPackageId('')
      setSelectedPlatforms([])
      setIconFile(null)

      // Refresh jobs list
      fetchJobs()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      case 'processing': return 'bg-blue-100 text-blue-800'
      case 'completed': return 'bg-green-100 text-green-800'
      case 'failed': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
          <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">
            Site-to-App Converter
          </h1>
          <p className="text-center text-gray-600 mb-8">
            Turn any website into an Android or Windows app
          </p>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 px-3 py-2 border"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 px-3 py-2 border"
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors font-medium"
            >
              {isLoginView ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-600">
            {isLoginView ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => setIsLoginView(!isLoginView)}
              className="text-indigo-600 hover:text-indigo-500 font-medium"
            >
              {isLoginView ? 'Sign Up' : 'Sign In'}
            </button>
          </p>

          <div className="mt-6 p-4 bg-yellow-50 rounded-md">
            <p className="text-xs text-yellow-800">
              <strong>Note:</strong> Generated apps are for personal/testing use. 
              Windows EXEs will trigger SmartScreen warnings (unsigned). 
              Android APKs require enabling "Unknown Sources".
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Site-to-App Converter</h1>
          <button
            onClick={handleLogout}
            className="text-gray-600 hover:text-gray-900 font-medium"
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Conversion Form */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Create New App</h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="url" className="block text-sm font-medium text-gray-700">
                Website URL *
              </label>
              <input
                type="url"
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-site.com"
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 px-3 py-2 border"
              />
              <p className="mt-1 text-sm text-gray-500">Must be HTTPS and publicly accessible</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="appName" className="block text-sm font-medium text-gray-700">
                  App Name *
                </label>
                <input
                  type="text"
                  id="appName"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="My Awesome App"
                  required
                  maxLength={100}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 px-3 py-2 border"
                />
              </div>

              <div>
                <label htmlFor="packageId" className="block text-sm font-medium text-gray-700">
                  Package ID *
                </label>
                <input
                  type="text"
                  id="packageId"
                  value={packageId}
                  onChange={(e) => setPackageId(e.target.value)}
                  placeholder="com.example.myapp"
                  required
                  pattern="[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 px-3 py-2 border"
                />
                <p className="mt-1 text-sm text-gray-500">Reverse domain format (lowercase letters, numbers, dots)</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Platforms *
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {PLATFORMS.map((platform) => (
                  <label
                    key={platform.id}
                    className={`relative flex items-center p-4 border rounded-lg cursor-pointer ${
                      selectedPlatforms.includes(platform.id)
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPlatforms.includes(platform.id)}
                      onChange={() => togglePlatform(platform.id)}
                      className="sr-only"
                    />
                    <span className="text-2xl mr-3">{platform.icon}</span>
                    <div>
                      <p className="font-medium text-gray-900">{platform.name}</p>
                      <p className="text-sm text-gray-500">{platform.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="icon" className="block text-sm font-medium text-gray-700">
                App Icon (optional)
              </label>
              <input
                type="file"
                id="icon"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setIconFile(e.target.files?.[0] || null)}
                className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
              <p className="mt-1 text-sm text-gray-500">PNG, JPEG, or WebP. Will be resized to 512x512.</p>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 p-4 rounded-md">
                {error}
              </div>
            )}

            <div className="bg-blue-50 p-4 rounded-md">
              <p className="text-sm text-blue-800">
                <strong>Disclaimer:</strong> You are responsible for ensuring you have the right to convert 
                the target website. Do not use this service to create impersonation apps or wrap sites 
                containing secrets/API keys you don't want distributed.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || selectedPlatforms.length === 0}
              className="w-full bg-indigo-600 text-white py-3 px-4 rounded-md hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Submitting...' : 'Build App'}
            </button>
          </form>
        </div>

        {/* Jobs List */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Your Builds</h2>
          </div>
          
          {jobs.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              No builds yet. Create your first app above!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      App
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      URL
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Platforms
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Download
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {jobs.map((job) => (
                    <tr key={job.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{job.app_name}</div>
                        <div className="text-sm text-gray-500">{job.package_id}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 hover:text-indigo-900">
                          {new URL(job.url).hostname}
                        </a>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex space-x-2">
                          {job.platforms.map((p) => (
                            <span key={p} className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">
                              {p === 'android' ? '📱' : '💻'} {p}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(job.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {job.downloadUrls ? (
                          <div className="flex space-x-2">
                            {job.downloadUrls.android && (
                              <a
                                href={job.downloadUrls.android}
                                className="text-indigo-600 hover:text-indigo-900"
                              >
                                APK
                              </a>
                            )}
                            {job.downloadUrls.windows && (
                              <a
                                href={job.downloadUrls.windows}
                                className="text-indigo-600 hover:text-indigo-900"
                              >
                                EXE
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
