package com.ailearninghub.auth;

import com.ailearninghub.identity.UserRepository;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class CurrentUserController {
  private final UserRepository users;

  public CurrentUserController(UserRepository users) { this.users = users; }

  @GetMapping("/me")
  AuthController.CurrentUser getCurrentUser(@AuthenticationPrincipal Long userId) {
    return users.findById(userId).map(AuthController.CurrentUser::from)
        .orElseThrow(AuthException::unauthorized);
  }
}
