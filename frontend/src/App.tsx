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

// Icons as SVG components
const RocketIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
)

const CodeIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
  </svg>
)

const ShieldIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
)

const GlobeIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
  </svg>
)

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

const ArrowRightIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
  </svg>
)

const DownloadIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
)

const StarIcon = () => (
  <svg className="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
  </svg>
)

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
  const [showDashboard, setShowDashboard] = useState(false)

  useEffect(() => {
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
        setShowDashboard(true)
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
    setShowDashboard(false)
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

      setUrl('')
      setAppName('')
      setPackageId('')
      setSelectedPlatforms([])
      setIconFile(null)
      fetchJobs()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'processing': return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'completed': return 'bg-green-100 text-green-800 border-green-200'
      case 'failed': return 'bg-red-100 text-red-800 border-red-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  // Landing Page
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-white overflow-x-hidden">
        {/* Navigation */}
        <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-20">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                  <RocketIcon />
                </div>
                <span className="text-2xl font-bold gradient-text">AppForge</span>
              </div>
              <div className="hidden md:flex items-center space-x-8">
                <a href="#features" className="text-gray-600 hover:text-indigo-600 transition-colors font-medium">Features</a>
                <a href="#how-it-works" className="text-gray-600 hover:text-indigo-600 transition-colors font-medium">How It Works</a>
                <a href="#testimonials" className="text-gray-600 hover:text-indigo-600 transition-colors font-medium">Testimonials</a>
                <button
                  onClick={() => setShowDashboard(true)}
                  className="btn-glow bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-2.5 rounded-full font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
                >
                  Get Started Free
                </button>
              </div>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-32 overflow-hidden">
          {/* Background decorations */}
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-purple-50"></div>
          <div className="absolute top-20 left-10 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-float"></div>
          <div className="absolute bottom-20 right-10 w-72 h-72 bg-indigo-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-float" style={{ animationDelay: '2s' }}></div>
          
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <div className="inline-flex items-center px-4 py-2 bg-indigo-100 rounded-full mb-8">
                <span className="text-sm font-semibold text-indigo-700">✨ Transform Your Website in Minutes</span>
              </div>
              
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold text-gray-900 leading-tight mb-6">
                Turn Any Website Into a
                <span className="block gradient-text">Native Mobile & Desktop App</span>
              </h1>
              
              <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-10 leading-relaxed">
                Convert your website into production-ready Android APKs and Windows executables 
                with just a few clicks. No coding required.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
                <button
                  onClick={() => setShowDashboard(true)}
                  className="btn-glow w-full sm:w-auto bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-4 rounded-full font-semibold text-lg shadow-xl hover:shadow-2xl transform hover:-translate-y-1 transition-all duration-200 flex items-center justify-center"
                >
                  Start Building Free
                  <ArrowRightIcon />
                </button>
                <a
                  href="#how-it-works"
                  className="w-full sm:w-auto px-8 py-4 rounded-full font-semibold text-lg text-gray-700 bg-white border-2 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all duration-200 flex items-center justify-center"
                >
                  See How It Works
                </a>
              </div>

              {/* Hero Image/Mockup */}
              <div className="relative max-w-5xl mx-auto animate-float">
                <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl p-1 shadow-2xl">
                  <div className="bg-white rounded-xl overflow-hidden">
                    <img
                      src="https://images.unsplash.com/photo-1551650975-87deedd944c3?w=1200&h=600&fit=crop"
                      alt="App Dashboard Preview"
                      className="w-full h-auto"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">Everything You Need to Go Native</h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Powerful features that make app creation simple and secure
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                {
                  icon: <RocketIcon />,
                  title: 'Lightning Fast',
                  description: 'Build and deploy your apps in minutes, not hours. Our optimized pipeline gets you results quickly.',
                  color: 'from-orange-400 to-red-500'
                },
                {
                  icon: <CodeIcon />,
                  title: 'No Coding Required',
                  description: 'Simply enter your website URL and we handle all the technical complexity behind the scenes.',
                  color: 'from-indigo-400 to-purple-500'
                },
                {
                  icon: <ShieldIcon />,
                  title: 'Secure & Private',
                  description: 'Your data is encrypted and protected. We never share your information with third parties.',
                  color: 'from-green-400 to-teal-500'
                },
                {
                  icon: <GlobeIcon />,
                  title: 'Multi-Platform',
                  description: 'Deploy to Android and Windows from a single build. Expand your reach effortlessly.',
                  color: 'from-blue-400 to-cyan-500'
                }
              ].map((feature, index) => (
                <div
                  key={index}
                  className="group bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-2"
                >
                  <div className={`w-16 h-16 bg-gradient-to-br ${feature.color} rounded-2xl flex items-center justify-center text-white mb-6 group-hover:scale-110 transition-transform duration-300`}>
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">How It Works</h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Three simple steps to your native app
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-12">
              {[
                {
                  step: '01',
                  title: 'Enter Your URL',
                  description: 'Provide the website URL you want to convert. We\'ll analyze it and prepare the build environment.',
                  image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=300&fit=crop'
                },
                {
                  step: '02',
                  title: 'Customize Your App',
                  description: 'Choose your target platforms, upload an icon, and configure your app settings.',
                  image: 'https://images.unsplash.com/photo-1581092921461-eab62e97a782?w=400&h=300&fit=crop'
                },
                {
                  step: '03',
                  title: 'Download & Deploy',
                  description: 'Get your compiled app files ready to distribute. Install on devices or share with users.',
                  image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=300&fit=crop'
                }
              ].map((item, index) => (
                <div key={index} className="relative">
                  <div className="bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300">
                    <div className="relative h-48 overflow-hidden">
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-full h-full object-cover transform hover:scale-110 transition-transform duration-500"
                      />
                      <div className="absolute top-4 left-4 w-12 h-12 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg">
                        {item.step}
                      </div>
                    </div>
                    <div className="p-6">
                      <h3 className="text-2xl font-bold text-gray-900 mb-3">{item.title}</h3>
                      <p className="text-gray-600 leading-relaxed">{item.description}</p>
                    </div>
                  </div>
                  {index < 2 && (
                    <div className="hidden md:block absolute top-1/2 -right-6 transform -translate-y-1/2 z-10">
                      <ArrowRightIcon />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials Section */}
        <section id="testimonials" className="py-20 bg-gradient-to-br from-indigo-600 to-purple-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-white mb-4">Loved by Developers & Businesses</h2>
              <p className="text-xl text-indigo-200 max-w-2xl mx-auto">
                See what our customers are saying about AppForge
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  name: 'Sarah Chen',
                  role: 'Founder, TechStart',
                  content: 'AppForge saved us weeks of development time. We converted our SaaS dashboard into mobile apps in under an hour!',
                  avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop'
                },
                {
                  name: 'Marcus Rodriguez',
                  role: 'Indie Developer',
                  content: 'The quality of the generated apps is incredible. My clients can\'t believe how fast we delivered their native apps.',
                  avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop'
                },
                {
                  name: 'Emily Watson',
                  role: 'Marketing Director',
                  content: 'Finally, a solution that lets us deploy to multiple platforms without maintaining separate codebases. Game changer!',
                  avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop'
                }
              ].map((testimonial, index) => (
                <div
                  key={index}
                  className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 hover:bg-white/15 transition-all duration-300"
                >
                  <div className="flex mb-4">
                    {[...Array(5)].map((_, i) => (
                      <StarIcon key={i} />
                    ))}
                  </div>
                  <p className="text-white text-lg leading-relaxed mb-6">"{testimonial.content}"</p>
                  <div className="flex items-center">
                    <img
                      src={testimonial.avatar}
                      alt={testimonial.name}
                      className="w-12 h-12 rounded-full object-cover mr-4 border-2 border-white/30"
                    />
                    <div>
                      <p className="text-white font-semibold">{testimonial.name}</p>
                      <p className="text-indigo-200 text-sm">{testimonial.role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 bg-gray-50">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-4xl font-bold text-gray-900 mb-6">Ready to Build Your App?</h2>
            <p className="text-xl text-gray-600 mb-10">
              Join thousands of developers and businesses who trust AppForge to convert their websites into native apps.
            </p>
            <button
              onClick={() => setShowDashboard(true)}
              className="btn-glow bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-10 py-5 rounded-full font-semibold text-xl shadow-xl hover:shadow-2xl transform hover:-translate-y-1 transition-all duration-200"
            >
              Get Started for Free
            </button>
            <p className="mt-6 text-gray-500">
              No credit card required • Free tier available
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-gray-900 text-white py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-4 gap-8">
              <div className="col-span-2">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center">
                    <RocketIcon />
                  </div>
                  <span className="text-2xl font-bold">AppForge</span>
                </div>
                <p className="text-gray-400 max-w-md">
                  Transform your website into native mobile and desktop applications in minutes. 
                  No coding required.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-4">Product</h4>
                <ul className="space-y-2 text-gray-400">
                  <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                  <li><a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4">Company</h4>
                <ul className="space-y-2 text-gray-400">
                  <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-gray-800 mt-12 pt-8 text-center text-gray-400">
              <p>&copy; 2024 AppForge. All rights reserved.</p>
            </div>
          </div>
        </footer>

        {/* Auth Modal / Dashboard */}
        {showDashboard && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-900/50 backdrop-blur-sm">
            <div className="min-h-screen px-4 flex items-center justify-center">
              {!isLoggedIn ? (
                <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md relative animate-float">
                  <button
                    onClick={() => setShowDashboard(false)}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                  
                  <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                      <RocketIcon />
                    </div>
                    <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back</h2>
                    <p className="text-gray-600">Sign in to start building your apps</p>
                  </div>

                  <form onSubmit={handleAuth} className="space-y-4">
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                        Email Address
                      </label>
                      <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="w-full rounded-xl border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 px-4 py-3 border"
                        placeholder="you@example.com"
                      />
                    </div>
                    <div>
                      <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                        Password
                      </label>
                      <input
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="w-full rounded-xl border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 px-4 py-3 border"
                        placeholder="••••••••"
                      />
                    </div>

                    {error && (
                      <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm">
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      className="w-full btn-glow bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 px-4 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
                    >
                      {isLoginView ? 'Sign In' : 'Create Account'}
                    </button>
                  </form>

                  <p className="mt-6 text-center text-sm text-gray-600">
                    {isLoginView ? "Don't have an account? " : 'Already have an account? '}
                    <button
                      onClick={() => setIsLoginView(!isLoginView)}
                      className="text-indigo-600 hover:text-indigo-500 font-semibold"
                    >
                      {isLoginView ? 'Sign Up' : 'Sign In'}
                    </button>
                  </p>
                </div>
              ) : (
                <DashboardContent
                  url={url}
                  setUrl={setUrl}
                  appName={appName}
                  setAppName={setAppName}
                  packageId={packageId}
                  setPackageId={setPackageId}
                  selectedPlatforms={selectedPlatforms}
                  setSelectedPlatforms={setSelectedPlatforms}
                  iconFile={iconFile}
                  setIconFile={setIconFile}
                  isSubmitting={isSubmitting}
                  error={error}
                  jobs={jobs}
                  handleSubmit={handleSubmit}
                  handleLogout={handleLogout}
                  togglePlatform={togglePlatform}
                  getStatusColor={getStatusColor}
                  onClose={() => setShowDashboard(false)}
                />
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // If already logged in but not showing dashboard
  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardContent
        url={url}
        setUrl={setUrl}
        appName={appName}
        setAppName={setAppName}
        packageId={packageId}
        setPackageId={setPackageId}
        selectedPlatforms={selectedPlatforms}
        setSelectedPlatforms={setSelectedPlatforms}
        iconFile={iconFile}
        setIconFile={setIconFile}
        isSubmitting={isSubmitting}
        error={error}
        jobs={jobs}
        handleSubmit={handleSubmit}
        handleLogout={handleLogout}
        togglePlatform={togglePlatform}
        getStatusColor={getStatusColor}
      />
    </div>
  )
}

// Dashboard Component
function DashboardContent({ 
  url, setUrl, appName, setAppName, packageId, setPackageId,
  selectedPlatforms, setSelectedPlatforms, iconFile, setIconFile,
  isSubmitting, error, jobs, handleSubmit, handleLogout, togglePlatform,
  getStatusColor, onClose
}: any) {
  const PLATFORMS = [
    { id: 'android', name: 'Android APK', description: 'For Android devices (sideload)', icon: '📱' },
    { id: 'windows', name: 'Windows EXE', description: 'For Windows 10/11', icon: '💻' },
  ]

  return (
    <div className={`min-h-screen bg-gray-50 ${onClose ? '' : ''}`}>
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-md">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold gradient-text">AppForge Dashboard</h1>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={handleLogout}
              className="text-gray-600 hover:text-gray-900 font-medium px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Sign Out
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Conversion Form */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8 border border-gray-100">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Create New App</h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="url" className="block text-sm font-semibold text-gray-700 mb-2">
                Website URL *
              </label>
              <input
                type="url"
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-site.com"
                required
                className="w-full rounded-xl border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 px-4 py-3 border"
              />
              <p className="mt-2 text-sm text-gray-500">Must be HTTPS and publicly accessible</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="appName" className="block text-sm font-semibold text-gray-700 mb-2">
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
                  className="w-full rounded-xl border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 px-4 py-3 border"
                />
              </div>

              <div>
                <label htmlFor="packageId" className="block text-sm font-semibold text-gray-700 mb-2">
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
                  className="w-full rounded-xl border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 px-4 py-3 border"
                />
                <p className="mt-2 text-sm text-gray-500">Reverse domain format (lowercase letters, numbers, dots)</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Platforms *
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {PLATFORMS.map((platform) => (
                  <label
                    key={platform.id}
                    className={`relative flex items-center p-5 border-2 rounded-xl cursor-pointer transition-all duration-200 ${
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
                    <span className="text-3xl mr-4">{platform.icon}</span>
                    <div>
                      <p className="font-semibold text-gray-900">{platform.name}</p>
                      <p className="text-sm text-gray-500">{platform.description}</p>
                    </div>
                    {selectedPlatforms.includes(platform.id) && (
                      <div className="absolute top-4 right-4 text-indigo-600">
                        <CheckIcon />
                      </div>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="icon" className="block text-sm font-semibold text-gray-700 mb-2">
                App Icon (optional)
              </label>
              <div className="mt-2 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-xl hover:border-indigo-400 transition-colors">
                <div className="space-y-1 text-center">
                  {iconFile ? (
                    <div className="flex items-center justify-center space-x-2">
                      <CheckIcon />
                      <span className="text-sm text-gray-600">{iconFile.name}</span>
                    </div>
                  ) : (
                    <>
                      <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                        <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <div className="flex text-sm text-gray-600 justify-center">
                        <label className="relative cursor-pointer rounded-md font-medium text-indigo-600 hover:text-indigo-500">
                          <span>Upload a file</span>
                          <input
                            type="file"
                            id="icon"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(e) => setIconFile(e.target.files?.[0] || null)}
                            className="sr-only"
                          />
                        </label>
                        <p className="pl-1">or drag and drop</p>
                      </div>
                      <p className="text-xs text-gray-500">PNG, JPEG, or WebP up to 10MB</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 p-4 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || selectedPlatforms.length === 0}
              className="w-full btn-glow bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 px-4 rounded-xl font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all"
            >
              {isSubmitting ? 'Building Your App...' : 'Build App'}
            </button>
          </form>
        </div>

        {/* Jobs List */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-100">
            <h2 className="text-2xl font-bold text-gray-900">Your Builds</h2>
          </div>
          
          {jobs.length === 0 ? (
            <div className="px-8 py-16 text-center">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <DownloadIcon />
              </div>
              <p className="text-gray-500 text-lg">No builds yet. Create your first app above!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-8 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">App</th>
                    <th className="px-8 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">URL</th>
                    <th className="px-8 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Platforms</th>
                    <th className="px-8 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-8 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                    <th className="px-8 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Download</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-8 py-4 whitespace-nowrap">
                        <div className="text-sm font-semibold text-gray-900">{job.app_name}</div>
                        <div className="text-sm text-gray-500">{job.package_id}</div>
                      </td>
                      <td className="px-8 py-4 whitespace-nowrap">
                        <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 hover:text-indigo-900 font-medium">
                          {new URL(job.url).hostname}
                        </a>
                      </td>
                      <td className="px-8 py-4 whitespace-nowrap">
                        <div className="flex space-x-2">
                          {job.platforms.map((platform: string) => (
                            <span
                              key={platform}
                              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800"
                            >
                              {platform}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-8 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(job.status)}`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="px-8 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(job.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-8 py-4 whitespace-nowrap">
                        {job.status === 'completed' && job.downloadUrls ? (
                          <div className="flex space-x-2">
                            {job.downloadUrls.android && (
                              <a
                                href={job.downloadUrls.android}
                                className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                              >
                                <DownloadIcon />
                                <span className="ml-2">APK</span>
                              </a>
                            )}
                            {job.downloadUrls.windows && (
                              <a
                                href={job.downloadUrls.windows}
                                className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                              >
                                <DownloadIcon />
                                <span className="ml-2">EXE</span>
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <div className="mt-8 bg-amber-50 border border-amber-200 rounded-xl p-6">
          <p className="text-sm text-amber-800">
            <strong>⚠️ Important:</strong> Generated apps are for personal/testing use only. 
            Windows EXEs will trigger SmartScreen warnings (unsigned certificates). 
            Android APKs require enabling "Unknown Sources" for installation. 
            Ensure you have the right to convert the target website.
          </p>
        </div>
      </main>
    </div>
  )
}

export default App
