import { getAuthUser } from '../../../lib/auth'

export default async function handler(req, res) {
  const user = getAuthUser(req)

  if (!user) {
    return res.status(401).json({
      success: false,
      user: null
    })
  }

  return res.status(200).json({
    success: true,
    user
  })
}
