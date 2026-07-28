import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import CatalogScreen from '../screens/CatalogScreen';
import SightingsScreen from '../screens/SightingsScreen';
import EventsScreen from '../screens/EventsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const tabScreens = [
  {
    name: 'Home',
    component: HomeScreen,
    label: 'Inicio',
    icon: 'home-outline',
    iconActive: 'home',
  },
  {
    name: 'Catalog',
    component: CatalogScreen,
    label: 'Catálogo',
    icon: 'apps-outline',
    iconActive: 'apps',
  },
  {
    name: 'Sightings',
    component: SightingsScreen,
    label: 'Avistamientos',
    icon: 'binoculars-outline',
    iconActive: 'binoculars',
  },
  {
    name: 'Events',
    component: EventsScreen,
    label: 'Eventos',
    icon: 'calendar-outline',
    iconActive: 'calendar',
  },
  {
    name: 'Profile',
    component: ProfileScreen,
    label: 'Perfil',
    icon: 'person-outline',
    iconActive: 'person',
  },
];

function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      backBehavior="none"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontFamily: typography.body,
          fontSize: 9,
          fontWeight: '500',
          margin: 0,
          padding: 0,
        },
        tabBarIconStyle: {
          width: 22,
          height: 22,
        },
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: 6,
          height: 64,
        },
        tabBarItemStyle: {
          paddingHorizontal: 0,
          paddingVertical: 4,
          height: 60,
          minHeight: 60,
          justifyContent: 'center',
        },
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.text3,
      }}
    >
      {tabScreens.map((screen) => (
        <Tab.Screen
          key={screen.name}
          name={screen.name}
          component={screen.component}
          options={{
            tabBarLabel: screen.label,
            tabBarIcon: ({ focused, color }) => (
              <Ionicons
                name={focused ? screen.iconActive : screen.icon}
                size={20}
                color={color}
              />
            ),
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { isLoggedIn, setIsLoggedIn } = useAuth();

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isLoggedIn ? (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
          </>
        ) : (
          <Stack.Screen name="Login">
            {(props) => <LoginScreen {...props} onLogin={() => setIsLoggedIn(true)} />}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
