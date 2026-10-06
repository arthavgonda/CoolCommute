import { Alert, Platform } from 'react-native';
export const confirm = (title: string, message: string, ok = 'Confirm') =>
  Platform.OS === 'web'
    ? Promise.resolve(window.confirm(`${title}\n\n${message}`))
    : new Promise<boolean>(resolve =>
        Alert.alert(title, message, [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: ok, style: 'destructive', onPress: () => resolve(true) },
        ]),
      );
