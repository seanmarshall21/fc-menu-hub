import { createContext, useContext } from 'react'

// Lets the per-page header (PageScreen) open the mobile nav drawer that lives
// in Layout. Value is a function: () => openDrawer().
export const NavDrawerContext = createContext(null)
export const useNavDrawer = () => useContext(NavDrawerContext)
